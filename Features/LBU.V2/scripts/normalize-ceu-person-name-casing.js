#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CEU_SEED_DIR = path.join(PROJECT_ROOT, "supabase", "ceu-seed-parts");
const LBU_IMPORT_DIR = path.join(PROJECT_ROOT, "supabase", "lbu-client-import-parts");
const FULL_SEED_PATH = path.join(PROJECT_ROOT, "supabase", "ceu-seed.sql");

const CEU_SQL_PATTERN = /\('([^']+)',\s*'([^']+)',\s*'((?:[^']|'')*)'::jsonb,\s*(true|false)\)/g;
const LBU_JSON_PATTERN = /(\$lbu_import_json\$\s*)(\[[\s\S]*?\])(\s*\$lbu_import_json\$)/;

const NAME_FIELDS = new Set([
    "lastName",
    "firstName",
    "middleName",
    "fullName",
    "displayName",
    "sourceDisplayName",
    "name",
    "representative"
]);

const stats = {
    ceuFilesUpdated: 0,
    ceuRecordsUpdated: 0,
    ceuFieldsUpdated: 0,
    lbuFilesUpdated: 0,
    lbuRowsUpdated: 0,
    lbuLeaderFieldsUpdated: 0
};

function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function hasLetter(value) {
    return /\p{L}/u.test(String(value || ""));
}

function normalizeLineEndings(text, eol) {
    return text.replace(/\n/g, eol);
}

function humanizeWord(word) {
    const source = String(word || "");
    if (!source || !hasLetter(source)) {
        return source;
    }

    const punctuationMatch = source.match(/^([^A-Za-z\p{L}]*)(.*?)([^A-Za-z\p{L}]*)$/u);
    const leading = punctuationMatch ? punctuationMatch[1] : "";
    const core = punctuationMatch ? punctuationMatch[2] : source;
    const trailing = punctuationMatch ? punctuationMatch[3] : "";

    if (!core) {
        return source;
    }

    const lower = core.toLocaleLowerCase("en-PH");

    if (/^(jr|sr)$/i.test(core)) {
        return `${leading}${lower.charAt(0).toLocaleUpperCase("en-PH")}${lower.slice(1)}${trailing || "."}`;
    }

    if (/^(ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(core)) {
        return `${leading}${lower.toUpperCase()}${trailing}`;
    }

    if (/^\p{L}$/u.test(core)) {
        return `${leading}${core.toLocaleUpperCase("en-PH")}${trailing}`;
    }

    const humanized = lower
        .split(/([-'])/)
        .map(function (part) {
            if (part === "-" || part === "'") {
                return part;
            }
            if (!part) {
                return "";
            }
            return part.charAt(0).toLocaleUpperCase("en-PH") + part.slice(1);
        })
        .join("");

    return `${leading}${humanized}${trailing}`;
}

function humanizeNameText(value) {
    const text = cleanText(value);
    if (!text) {
        return "";
    }

    return text
        .split(/\s+/)
        .map(humanizeWord)
        .join(" ");
}

function humanizeDisplayText(value) {
    const text = cleanText(value);
    if (!text) {
        return "";
    }

    if (text.indexOf(",") === -1) {
        return humanizeNameText(text);
    }

    return text
        .split(",")
        .map(function (part) {
            return humanizeNameText(part);
        })
        .filter(Boolean)
        .join(", ");
}

function humanizeNameField(key, value) {
    if (!NAME_FIELDS.has(key)) {
        return value;
    }
    if (key === "displayName" || key === "sourceDisplayName") {
        return humanizeDisplayText(value);
    }
    return humanizeNameText(value);
}

function updateCeuRecord(record, fullNameMap) {
    let fieldUpdates = 0;
    const beforeFullName = cleanText(record.fullName);

    Object.keys(record).forEach(function (key) {
        if (typeof record[key] !== "string") {
            return;
        }
        const nextValue = humanizeNameField(key, record[key]);
        if (nextValue !== record[key]) {
            record[key] = nextValue;
            fieldUpdates += 1;
        }
    });

    const afterFullName = cleanText(record.fullName);
    if (beforeFullName && afterFullName && beforeFullName !== afterFullName) {
        fullNameMap.set(beforeFullName, afterFullName);
    }

    return fieldUpdates;
}

function processCeuSqlFile(filePath, fullNameMap) {
    const originalText = fs.readFileSync(filePath, "utf8");
    let changedRecords = 0;
    let changedFields = 0;

    const updatedText = originalText.replace(CEU_SQL_PATTERN, function (match, category, sourceId, jsonSql, isDeleted) {
        const rawJson = jsonSql.replace(/''/g, "'");
        const record = JSON.parse(rawJson);
        const fieldUpdates = updateCeuRecord(record, fullNameMap);
        if (!fieldUpdates) {
            return match;
        }
        changedRecords += 1;
        changedFields += fieldUpdates;
        const nextJsonSql = JSON.stringify(record).replace(/'/g, "''");
        return `('${category}', '${sourceId}', '${nextJsonSql}'::jsonb, ${isDeleted})`;
    });

    if (updatedText !== originalText) {
        fs.writeFileSync(filePath, updatedText, "utf8");
        stats.ceuFilesUpdated += 1;
        stats.ceuRecordsUpdated += changedRecords;
        stats.ceuFieldsUpdated += changedFields;
    }
}

function syncLeaderValue(value, fullNameMap) {
    const text = cleanText(value);
    if (!text) {
        return { changed: false, value };
    }
    const nextValue = fullNameMap.get(text);
    if (!nextValue || nextValue === value) {
        return { changed: false, value };
    }
    return { changed: true, value: nextValue };
}

function processLbuImportFile(filePath, fullNameMap) {
    const originalText = fs.readFileSync(filePath, "utf8");
    const eol = originalText.includes("\r\n") ? "\r\n" : "\n";
    const payloadMatch = originalText.match(LBU_JSON_PATTERN);
    if (!payloadMatch) {
        return;
    }

    const data = JSON.parse(payloadMatch[2]);
    let changedRows = 0;
    let changedFields = 0;

    data.forEach(function (entry) {
        let rowChanged = false;

        if (entry && entry.record) {
            const leaderResult = syncLeaderValue(entry.record.leaderBarangayOfficial, fullNameMap);
            if (leaderResult.changed) {
                entry.record.leaderBarangayOfficial = leaderResult.value;
                rowChanged = true;
                changedFields += 1;
            }

            if (Array.isArray(entry.record.history)) {
                entry.record.history.forEach(function (historyItem) {
                    const historyLeaderResult = syncLeaderValue(historyItem && historyItem.leader, fullNameMap);
                    if (historyLeaderResult.changed) {
                        historyItem.leader = historyLeaderResult.value;
                        rowChanged = true;
                        changedFields += 1;
                    }
                });
            }
        }

        if (entry && entry.historyEntry) {
            const rowHistoryResult = syncLeaderValue(entry.historyEntry.leader, fullNameMap);
            if (rowHistoryResult.changed) {
                entry.historyEntry.leader = rowHistoryResult.value;
                rowChanged = true;
                changedFields += 1;
            }
        }

        if (rowChanged) {
            changedRows += 1;
        }
    });

    if (!changedRows) {
        return;
    }

    const jsonText = normalizeLineEndings(JSON.stringify(data, null, 2), eol);
    const updatedText = originalText.replace(LBU_JSON_PATTERN, `$1${jsonText}$3`);
    fs.writeFileSync(filePath, updatedText, "utf8");
    stats.lbuFilesUpdated += 1;
    stats.lbuRowsUpdated += changedRows;
    stats.lbuLeaderFieldsUpdated += changedFields;
}

function getSortedSqlFiles(directory) {
    return fs
        .readdirSync(directory)
        .filter(function (name) {
            return name.toLowerCase().endsWith(".sql");
        })
        .sort(function (left, right) {
            return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
        })
        .map(function (name) {
            return path.join(directory, name);
        });
}

function main() {
    const fullNameMap = new Map();
    const ceuFiles = [FULL_SEED_PATH].concat(getSortedSqlFiles(CEU_SEED_DIR));
    ceuFiles.forEach(function (filePath) {
        processCeuSqlFile(filePath, fullNameMap);
    });

    getSortedSqlFiles(LBU_IMPORT_DIR).forEach(function (filePath) {
        processLbuImportFile(filePath, fullNameMap);
    });

    console.log(JSON.stringify({
        mappedNames: fullNameMap.size,
        stats
    }, null, 2));
}

main();
