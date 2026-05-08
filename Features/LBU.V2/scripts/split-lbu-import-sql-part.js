#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
    const args = {
        inputPath: "",
        batchSize: 10,
        outputDir: ""
    };

    for (let index = 2; index < argv.length; index += 1) {
        const arg = String(argv[index] || "");
        if (arg === "--input") {
            args.inputPath = path.resolve(String(argv[index + 1] || ""));
            index += 1;
        } else if (arg === "--batch-size") {
            const value = Number(argv[index + 1]);
            args.batchSize = Number.isFinite(value) && value > 0 ? value : args.batchSize;
            index += 1;
        } else if (arg === "--output-dir") {
            args.outputDir = path.resolve(String(argv[index + 1] || ""));
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.inputPath) {
        throw new Error("Missing --input <sql-file-path>.");
    }

    if (!args.outputDir) {
        args.outputDir = path.dirname(args.inputPath);
    }

    return args;
}

function extractImportParts(sqlText) {
    const pattern =
        /^(?<header>[\s\S]*?)select\s+\*\s*from\s+public\.lb_import_lbu_client_records\(\$lbu_import_json\$\s*(?<json>\[[\s\S]*\])\s*\$lbu_import_json\$\:\:jsonb\);\s*$/;
    const match = sqlText.match(pattern);
    if (!match || !match.groups) {
        throw new Error("Could not parse the import SQL file.");
    }

    return {
        header: String(match.groups.header || "").trimEnd(),
        records: JSON.parse(match.groups.json)
    };
}

function formatBatchSql(header, inputFileName, batchIndex, totalBatches, chunk) {
    const firstSeq = chunk[0] && chunk[0].seq;
    const lastSeq = chunk[chunk.length - 1] && chunk[chunk.length - 1].seq;

    return `${header}
-- Split batch ${batchIndex} of ${totalBatches} from ${inputFileName}.
-- Records in this batch: ${chunk.length}
-- Seq range: ${firstSeq} through ${lastSeq}

select *
from public.lb_import_lbu_client_records($lbu_import_json$
${JSON.stringify(chunk, null, 2)}
$lbu_import_json$::jsonb);
`;
}

function main() {
    const args = parseArgs(process.argv);
    const sqlText = fs.readFileSync(args.inputPath, "utf8");
    const parsed = extractImportParts(sqlText);
    const records = Array.isArray(parsed.records) ? parsed.records : [];

    if (!records.length) {
        throw new Error("No import records found in the SQL file.");
    }

    fs.mkdirSync(args.outputDir, { recursive: true });

    const baseName = path.basename(args.inputPath, ".sql");
    const totalBatches = Math.ceil(records.length / args.batchSize);
    const createdFiles = [];

    for (let index = 0; index < totalBatches; index += 1) {
        const start = index * args.batchSize;
        const end = start + args.batchSize;
        const chunk = records.slice(start, end);
        const batchNumber = String(index + 1).padStart(2, "0");
        const outputPath = path.join(args.outputDir, `${baseName}-batch-${batchNumber}.sql`);
        const outputSql = formatBatchSql(
            parsed.header,
            path.basename(args.inputPath),
            index + 1,
            totalBatches,
            chunk
        );

        fs.writeFileSync(outputPath, outputSql, "utf8");
        createdFiles.push({
            outputPath: outputPath,
            count: chunk.length,
            firstSeq: chunk[0].seq,
            lastSeq: chunk[chunk.length - 1].seq
        });
    }

    const summaryPath = path.join(args.outputDir, `${baseName}-batches-summary.md`);
    const summaryLines = [
        `# ${baseName} Split Batches`,
        "",
        `Source: \`${path.basename(args.inputPath)}\``,
        `Batch size: ${args.batchSize}`,
        `Total records: ${records.length}`,
        `Total batches: ${totalBatches}`,
        "",
        "Run the files below in order:",
        ""
    ];

    createdFiles.forEach(function (fileInfo, index) {
        summaryLines.push(
            `${index + 1}. \`${path.basename(fileInfo.outputPath)}\``,
            `   Records: ${fileInfo.count}`,
            `   Seq range: ${fileInfo.firstSeq} through ${fileInfo.lastSeq}`
        );
    });

    fs.writeFileSync(summaryPath, `${summaryLines.join("\n")}\n`, "utf8");

    console.log(
        JSON.stringify(
            {
                inputPath: args.inputPath,
                batchSize: args.batchSize,
                totalRecords: records.length,
                totalBatches: totalBatches,
                summaryPath: summaryPath,
                files: createdFiles
            },
            null,
            2
        )
    );
}

main();
