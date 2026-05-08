(function (root, factory) {
    if (typeof module !== "undefined" && module.exports) {
        module.exports = factory(root);
        return;
    }

    root.lbXlsxLite = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
    "use strict";

    const textDecoder = new TextDecoder("utf-8");
    const EOCD_SIGNATURE = 0x06054b50;
    const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
    const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

    function decodeXmlEntities(value) {
        return String(value || "").replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, function (_, token) {
            const lower = String(token || "").toLowerCase();
            if (lower === "amp") return "&";
            if (lower === "lt") return "<";
            if (lower === "gt") return ">";
            if (lower === "quot") return "\"";
            if (lower === "apos") return "'";
            if (lower.indexOf("#x") === 0) {
                return String.fromCodePoint(parseInt(lower.slice(2), 16));
            }
            if (lower.indexOf("#") === 0) {
                return String.fromCodePoint(parseInt(lower.slice(1), 10));
            }
            return _;
        });
    }

    function parseAttributes(source) {
        const attrs = {};
        const regex = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
        let match;

        while ((match = regex.exec(String(source || "")))) {
            attrs[match[1]] = decodeXmlEntities(match[3] != null ? match[3] : match[4]);
        }

        return attrs;
    }

    function resolveZipPath(baseDir, target) {
        const rawTarget = String(target || "").trim();
        if (!rawTarget) return "";

        const combined = rawTarget.charAt(0) === "/"
            ? rawTarget.slice(1)
            : (baseDir ? `${baseDir}/${rawTarget}` : rawTarget);

        const parts = combined.split("/");
        const resolved = [];

        parts.forEach(function (part) {
            if (!part || part === ".") return;
            if (part === "..") {
                resolved.pop();
                return;
            }
            resolved.push(part);
        });

        return resolved.join("/");
    }

    function getColumnIndexFromReference(ref) {
        const match = String(ref || "").match(/^[A-Z]+/i);
        if (!match) return -1;

        const letters = match[0].toUpperCase();
        let index = 0;
        for (let i = 0; i < letters.length; i += 1) {
            index = (index * 26) + (letters.charCodeAt(i) - 64);
        }
        return index - 1;
    }

    function extractTagText(innerXml, tagName) {
        const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
        let match;
        let text = "";

        while ((match = regex.exec(String(innerXml || "")))) {
            text += decodeXmlEntities(match[1].replace(/<[^>]+>/g, ""));
        }

        return text;
    }

    function extractFirstTagText(innerXml, tagName) {
        const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
        const match = regex.exec(String(innerXml || ""));
        return match ? decodeXmlEntities(match[1].replace(/<[^>]+>/g, "")) : "";
    }

    async function inflateRaw(bytes) {
        if (typeof root.DecompressionStream !== "function") {
            throw new Error("This browser does not support Excel import yet. DecompressionStream is unavailable.");
        }

        const stream = new Blob([bytes]).stream().pipeThrough(new root.DecompressionStream("deflate-raw"));
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
    }

    function findEndOfCentralDirectory(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const minOffset = Math.max(0, bytes.byteLength - 0xffff - 22);

        for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
            if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
                return offset;
            }
        }

        throw new Error("Unable to locate the XLSX central directory.");
    }

    function parseZipEntries(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const eocdOffset = findEndOfCentralDirectory(bytes);
        const totalEntries = view.getUint16(eocdOffset + 10, true);
        const directoryOffset = view.getUint32(eocdOffset + 16, true);
        const entries = {};
        let offset = directoryOffset;

        for (let index = 0; index < totalEntries; index += 1) {
            const signature = view.getUint32(offset, true);
            if (signature !== CENTRAL_DIRECTORY_SIGNATURE) {
                throw new Error("Unexpected ZIP central directory signature.");
            }

            const compressionMethod = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const fileNameLength = view.getUint16(offset + 28, true);
            const extraFieldLength = view.getUint16(offset + 30, true);
            const fileCommentLength = view.getUint16(offset + 32, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);
            const nameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
            const fileName = textDecoder.decode(nameBytes);

            entries[fileName] = {
                compressionMethod: compressionMethod,
                compressedSize: compressedSize,
                localHeaderOffset: localHeaderOffset,
                fileName: fileName
            };

            offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
        }

        return entries;
    }

    async function extractEntry(bytes, entries, fileName) {
        const entry = entries[fileName];
        if (!entry) return null;

        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const offset = entry.localHeaderOffset;
        const signature = view.getUint32(offset, true);
        if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
            throw new Error(`Unexpected ZIP local header signature for ${fileName}.`);
        }

        const fileNameLength = view.getUint16(offset + 26, true);
        const extraFieldLength = view.getUint16(offset + 28, true);
        const dataStart = offset + 30 + fileNameLength + extraFieldLength;
        const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

        if (entry.compressionMethod === 0) {
            return compressed;
        }

        if (entry.compressionMethod === 8) {
            return inflateRaw(compressed);
        }

        throw new Error(`Unsupported XLSX compression method (${entry.compressionMethod}) in ${fileName}.`);
    }

    async function extractEntryText(bytes, entries, fileName) {
        const content = await extractEntry(bytes, entries, fileName);
        if (!content) return "";
        return textDecoder.decode(content);
    }

    function parseSharedStrings(xmlText) {
        const strings = [];
        const regex = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
        let match;

        while ((match = regex.exec(String(xmlText || "")))) {
            strings.push(extractTagText(match[1], "t"));
        }

        return strings;
    }

    function parseRelationships(xmlText, baseDir) {
        const relationships = {};
        const regex = /<Relationship\b([^>]*)\/>/gi;
        let match;

        while ((match = regex.exec(String(xmlText || "")))) {
            const attrs = parseAttributes(match[1]);
            if (!attrs.Id || !attrs.Target) continue;
            relationships[attrs.Id] = resolveZipPath(baseDir, attrs.Target);
        }

        return relationships;
    }

    function parseWorkbookSheets(xmlText) {
        const sheets = [];
        const regex = /<sheet\b([^>]*)\/>/gi;
        let match;

        while ((match = regex.exec(String(xmlText || "")))) {
            const attrs = parseAttributes(match[1]);
            const relationshipId = attrs["r:id"] || attrs.id;
            if (!attrs.name || !relationshipId) continue;

            sheets.push({
                name: attrs.name,
                relationshipId: relationshipId
            });
        }

        return sheets;
    }

    function parseSheetRows(xmlText, sharedStrings) {
        const rows = [];
        const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(String(xmlText || "")))) {
            const rowXml = rowMatch[1];
            const row = [];
            const cellRegex = /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
            let cellMatch;
            let nextIndex = 0;

            while ((cellMatch = cellRegex.exec(rowXml))) {
                const attrs = parseAttributes(cellMatch[1] || cellMatch[2] || "");
                const ref = attrs.r || "";
                const type = String(attrs.t || "").trim();
                const innerXml = cellMatch[3] || "";
                const explicitIndex = getColumnIndexFromReference(ref);
                const columnIndex = explicitIndex >= 0 ? explicitIndex : nextIndex;
                let value = "";

                if (type === "s") {
                    const sharedIndex = Number(extractFirstTagText(innerXml, "v"));
                    if (Number.isFinite(sharedIndex) && sharedIndex >= 0 && sharedIndex < sharedStrings.length) {
                        value = sharedStrings[sharedIndex];
                    }
                } else if (type === "inlineStr") {
                    value = extractTagText(innerXml, "t");
                } else {
                    value = extractFirstTagText(innerXml, "v");
                }

                row[columnIndex] = value;
                nextIndex = columnIndex + 1;
            }

            rows.push(row);
        }

        return rows;
    }

    async function parseArrayBuffer(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const entries = parseZipEntries(bytes);
        const workbookXml = await extractEntryText(bytes, entries, "xl/workbook.xml");
        if (!workbookXml) {
            throw new Error("The selected file does not look like a valid XLSX workbook.");
        }

        const workbookRelsXml = await extractEntryText(bytes, entries, "xl/_rels/workbook.xml.rels");
        const sharedStringsXml = await extractEntryText(bytes, entries, "xl/sharedStrings.xml");
        const sharedStrings = parseSharedStrings(sharedStringsXml);
        const sheets = parseWorkbookSheets(workbookXml);
        const relationships = parseRelationships(workbookRelsXml, "xl");
        const parsedSheets = [];

        for (let index = 0; index < sheets.length; index += 1) {
            const sheet = sheets[index];
            const sheetPath = relationships[sheet.relationshipId];
            if (!sheetPath) continue;

            const sheetXml = await extractEntryText(bytes, entries, sheetPath);
            if (!sheetXml) continue;

            parsedSheets.push({
                name: sheet.name,
                path: sheetPath,
                rows: parseSheetRows(sheetXml, sharedStrings)
            });
        }

        return {
            sheets: parsedSheets
        };
    }

    async function parseFile(file) {
        if (!file || typeof file.arrayBuffer !== "function") {
            throw new Error("Choose a valid Excel file first.");
        }
        return parseArrayBuffer(await file.arrayBuffer());
    }

    return {
        parseArrayBuffer: parseArrayBuffer,
        parseFile: parseFile
    };
});
