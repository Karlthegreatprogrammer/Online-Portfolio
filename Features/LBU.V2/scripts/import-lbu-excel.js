#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const xlsxLite = require("../assets/js/xlsx-lite.js");
const excelImporter = require("../assets/js/record-excel-import.js");

function printUsage() {
    console.log([
        "Usage:",
        "  node scripts/import-lbu-excel.js --file <xlsx-path> [--sheet <name>] [--max-row <rowNumber>] [--apply]",
        "",
        "Options:",
        "  --file <path>         XLSX workbook to import",
        "  --sheet <name>        Restrict import to a specific worksheet (repeatable)",
        "  --max-row <number>    Import only up to this 1-based worksheet row number",
        "  --apply               Push the import into the configured Supabase records table",
        "  --access-token <jwt>  Supabase access token to use for authenticated requests",
        "  --output-json <path>  Write the parsed rows / change summary to a JSON file",
        "  --help                Show this help message"
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        accessToken: process.env.LBU_SUPABASE_ACCESS_TOKEN || "",
        apply: false,
        filePath: "",
        maxRowNumber: null,
        outputJson: "",
        sheetNames: []
    };

    for (let index = 2; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") {
            args.help = true;
            continue;
        }
        if (arg === "--apply") {
            args.apply = true;
            continue;
        }
        if (arg === "--file") {
            args.filePath = String(argv[index + 1] || "");
            index += 1;
            continue;
        }
        if (arg === "--sheet") {
            const value = String(argv[index + 1] || "").trim();
            if (value) {
                args.sheetNames.push(value);
            }
            index += 1;
            continue;
        }
        if (arg === "--max-row") {
            const value = Number(argv[index + 1]);
            args.maxRowNumber = Number.isFinite(value) && value > 0 ? value : null;
            index += 1;
            continue;
        }
        if (arg === "--access-token") {
            args.accessToken = String(argv[index + 1] || "");
            index += 1;
            continue;
        }
        if (arg === "--output-json") {
            args.outputJson = String(argv[index + 1] || "");
            index += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

function loadSupabaseConfig() {
    const configPath = path.resolve(__dirname, "../assets/js/supabase-config.js");
    const source = fs.readFileSync(configPath, "utf8");
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(source, context);
    const config = context.window && context.window.LBU_SUPABASE_CONFIG;
    if (!config || !config.url || !config.anonKey || !config.recordsTable) {
        throw new Error("Supabase configuration is incomplete.");
    }
    return config;
}

function resolveWorkbookPath(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Workbook not found: ${resolved}`);
    }
    return resolved;
}

async function loadWorkbook(filePath) {
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return xlsxLite.parseArrayBuffer(arrayBuffer);
}

async function supabaseRequest(config, accessToken, endpoint, options) {
    const opts = options || {};
    const headers = Object.assign({
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken || config.anonKey}`
    }, opts.headers || {});

    const response = await fetch(`${config.url}${endpoint}`, Object.assign({}, opts, { headers }));
    const raw = await response.text();
    let parsed = null;

    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            parsed = raw;
        }
    }

    if (!response.ok) {
        const message = parsed && parsed.message
            ? parsed.message
            : (typeof parsed === "string" ? parsed : response.statusText);
        throw new Error(`Supabase ${response.status}: ${message}`);
    }

    return parsed;
}

async function fetchExistingRecords(config, accessToken) {
    const results = [];
    const pageSize = 1000;

    for (let offset = 0; ; offset += pageSize) {
        const rows = await supabaseRequest(
            config,
            accessToken,
            `/rest/v1/${config.recordsTable}?select=id,record,updated_at&order=id.asc&limit=${pageSize}&offset=${offset}`,
            {
                headers: {
                    Accept: "application/json"
                },
                method: "GET"
            }
        );

        const chunk = Array.isArray(rows) ? rows : [];
        results.push.apply(results, chunk);
        if (chunk.length < pageSize) {
            break;
        }
    }

    return results.map(function (row) {
        const payload = row && row.record && typeof row.record === "object" ? row.record : {};
        return Object.assign({}, payload, { id: row.id });
    });
}

async function createRecords(config, accessToken, records) {
    const queue = Array.isArray(records) ? records.filter(Boolean) : [];
    const batchSize = 100;

    for (let index = 0; index < queue.length; index += batchSize) {
        const batch = queue.slice(index, index + batchSize).map(function (record) {
            const payload = JSON.parse(JSON.stringify(record || {}));
            delete payload.id;
            return { record: payload };
        });

        await supabaseRequest(
            config,
            accessToken,
            `/rest/v1/${config.recordsTable}`,
            {
                body: JSON.stringify(batch),
                headers: {
                    "Content-Type": "application/json",
                    Prefer: "return=minimal"
                },
                method: "POST"
            }
        );
    }
}

async function updateRecords(config, accessToken, records) {
    const queue = Array.isArray(records) ? records.filter(function (record) {
        return record && record.id != null;
    }) : [];
    const batchSize = 100;

    for (let index = 0; index < queue.length; index += batchSize) {
        const batch = queue.slice(index, index + batchSize).map(function (record) {
            const payload = JSON.parse(JSON.stringify(record || {}));
            const recordId = payload.id;
            delete payload.id;
            return {
                id: recordId,
                record: payload
            };
        });

        await supabaseRequest(
            config,
            accessToken,
            `/rest/v1/${config.recordsTable}?on_conflict=id`,
            {
                body: JSON.stringify(batch),
                headers: {
                    "Content-Type": "application/json",
                    Prefer: "resolution=merge-duplicates, return=minimal"
                },
                method: "POST"
            }
        );
    }
}

function buildImportOptions(args) {
    const options = {};
    if (args.sheetNames.length) {
        options.sheetNames = args.sheetNames.slice();
    }
    if (Number.isFinite(args.maxRowNumber) && args.maxRowNumber > 0) {
        options.maxRowNumber = args.maxRowNumber;
    }
    return options;
}

function buildReport(parsed, changes, existingCount) {
    return {
        existingRecordCount: typeof existingCount === "number" ? existingCount : null,
        parsedRows: Array.isArray(parsed && parsed.rows) ? parsed.rows.length : 0,
        skippedSheets: parsed && parsed.skippedSheets ? parsed.skippedSheets : [],
        supportedSheets: parsed && parsed.supportedSheets ? parsed.supportedSheets : [],
        stats: changes && changes.stats ? changes.stats : null
    };
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || !args.filePath) {
        printUsage();
        return;
    }

    const workbookPath = resolveWorkbookPath(args.filePath);
    const workbook = await loadWorkbook(workbookPath);
    const parsed = excelImporter.buildImportedRows(workbook, path.basename(workbookPath), buildImportOptions(args));

    let existingRecords = [];
    let changes = excelImporter.buildImportChanges(existingRecords, parsed.rows);
    let remoteFetchError = null;

    try {
        const config = loadSupabaseConfig();
        existingRecords = await fetchExistingRecords(config, args.accessToken);
        changes = excelImporter.buildImportChanges(existingRecords, parsed.rows);

        if (args.apply) {
            await createRecords(config, args.accessToken, changes.creates);
            await updateRecords(config, args.accessToken, changes.updates);
        }
    } catch (error) {
        remoteFetchError = error;
        if (args.apply) {
            throw error;
        }
    }

    const report = buildReport(parsed, changes, existingRecords.length);
    if (args.outputJson) {
        const outputPath = path.resolve(args.outputJson);
        fs.writeFileSync(outputPath, JSON.stringify({
            report: report,
            sampleRows: parsed.rows.slice(0, 20),
            changes: changes
        }, null, 2));
    }

    console.log(JSON.stringify(report, null, 2));

    if (remoteFetchError) {
        console.log(`Remote fetch skipped: ${remoteFetchError.message}`);
    } else if (args.apply) {
        console.log("Import applied successfully.");
    } else {
        console.log("Dry run completed.");
    }
}

main().catch(function (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
