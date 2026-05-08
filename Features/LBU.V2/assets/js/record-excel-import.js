(function (root, factory) {
    if (typeof module !== "undefined" && module.exports) {
        module.exports = factory(root);
        return;
    }

    root.lbRecordExcelImport = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
    "use strict";

    const SUFFIX_TOKENS = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);
    const SUPPORTED_NAME_HEADERS = ["PATIENT'S NAME", "CLIENT'S NAME", "NAME"];
    const TEMPLATE_HEADERS = [
        "DATE REQUESTED",
        "CLIENT'S NAME",
        "TYPE OF ASSISTANCE",
        "ASSISTANCE PROVIDED",
        "AMOUNT",
        "HOUSE NUMBER/BLOCK/LOT",
        "PUROK/STREET",
        "SUBDIVISION/VILLAGE/COMPOUND",
        "BARANGAY",
        "CONTACT NUMBER",
        "REFERRAL SOURCE",
        "CLIENT STATUS",
        "NAME OF LEADER/VIP/PARTNER",
        "ORGANIZATION"
    ];
    const TEMPLATE_HEADER_GROUPS = [
        { label: "DATE REQUESTED", names: ["DATE REQUESTED", "REQUESTED DATE", "DATE"], required: false },
        { label: "CLIENT'S NAME", names: SUPPORTED_NAME_HEADERS, required: true },
        { label: "TYPE OF ASSISTANCE", names: ["TYPE OF ASSISTANCE"], required: true },
        { label: "ASSISTANCE PROVIDED", names: ["ASSISTANCE PROVIDED"], required: false },
        { label: "AMOUNT", names: ["AMOUNT"], required: false },
        { label: "HOUSE NUMBER/BLOCK/LOT", names: ["HOUSE NUMBER/BLOCK/LOT"], required: false },
        { label: "PUROK/STREET", names: ["PUROK/STREET", "COMPLETE ADDRESS"], required: false },
        { label: "SUBDIVISION/VILLAGE/COMPOUND", names: ["SUBDIVISION/VILLAGE/COMPOUND", "SUBDIVSION/VILLAGE/COMPOUND"], required: false },
        { label: "BARANGAY", names: ["BARANGAY"], required: true },
        { label: "CONTACT NUMBER", names: ["CONTACT NUMBER", "CONTACT NUMBER PATIENT"], required: false },
        { label: "REFERRAL SOURCE", names: ["REFERRAL SOURCE"], required: false },
        { label: "CLIENT STATUS", names: ["CLIENT STATUS"], required: false },
        { label: "NAME OF LEADER/VIP/PARTNER", names: ["NAME OF LEADER/VIP/PARTNER", "NAME OF LEADER/VIP"], required: false },
        { label: "ORGANIZATION", names: ["ORGANIZATION"], required: false }
    ];
    const NEW_CLIENT_LABEL = "Unang beses pa lang na lalapit para humingi ng tulong medical sa inyong opisina (New Client)";
    const RETURNING_CLIENT_LABEL = "Pangalawa o makailang beses na nakalapit para humingi ng tulong medical sa inyong opisina (Returning Client)";
    const LEADING_NAME_TOKENS = new Set(["ma", "ma.", "gov", "gov.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "dr", "dr.", "dra", "dra.", "atty", "atty.", "attorney"]);
    const SINGLE_TOKEN_LAST_NAME_PARTICLES = new Set(["de", "del", "dela", "delos", "delas", "la", "las", "los", "san", "santa", "sta", "sto", "van", "von", "bin", "ibn", "du"]);
    const MULTI_TOKEN_LAST_NAME_PARTICLES = [
        ["de", "la"],
        ["de", "los"],
        ["de", "las"],
        ["san", "de"],
        ["santa", "de"]
    ];
    const LOWERCASE_NAME_PARTICLES = new Set(["de", "del", "dela", "delos", "delas", "la", "las", "los", "san", "santa", "sta", "sto", "van", "von", "bin", "ibn", "du", "of", "and"]);
    const LEADER_ROLE_PREFIXES = /\b(hon|honorable|mr|mrs|ms|miss|kap|kapt|capt|captain|kag|kagawad|chair|chairman|chairwoman|konsi|konsehal|councilor)\.?\b/gi;
    const BLANK_SENTINELS = new Set(["na", "n a", "n/a", "none", "null", "blank"]);
    const PROGRAM_TYPE_BY_SELECTION = Object.freeze({
        "Hospital Bill": "Medical",
        "Laboratory/Medical Procedure": "Medical",
        "Eye glass": "Medical",
        "Transport Service - Medical Client": "Medical",
        "Medicine": "Medical",
        "Medical Financial Assistance (Cash)": "Medical",
        "OP Assistance": "Medical",
        "Special Case - Medical Client": "Medical",
        "Guarantee Letter": "Medical"
    });
    const LEADER_NAME_ALIASES = Object.freeze({
        "jess imperial": "Jessie C Imperial",
        "jessie imperial": "Jessie C Imperial",
        "jessie c imperial": "Jessie C Imperial",
        "regina amorante": "Regina A. Amorante",
        "regina a amorante": "Regina A. Amorante",
        "richard gomez": "Richard L Gomez",
        "richard l gomez": "Richard L Gomez"
    });

    function cleanText(value) {
        return String(value == null ? "" : value)
            .replace(/\s+/g, " ")
            .trim();
    }

    function stripDiacritics(value) {
        return cleanText(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function normalizeHeader(value) {
        return cleanText(value)
            .toUpperCase()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ");
    }

    function normalizeCompareText(value) {
        return stripDiacritics(value)
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeClientTag(value) {
        const normalized = normalizeCompareText(value);
        if (!normalized) return "";
        if (normalized === "new client") return NEW_CLIENT_LABEL;
        if (normalized === "return client" || normalized === "returning client") return RETURNING_CLIENT_LABEL;
        return "";
    }

    function extractYearHint() {
        for (let index = 0; index < arguments.length; index += 1) {
            const value = String(arguments[index] || "");
            const match = value.match(/\b(20\d{2})\b/);
            if (match) return match[1];
        }
        return "";
    }

    function stableHash(value) {
        const text = cleanText(value);
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function isLeapYear(year) {
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }

    function createDeterministicDateInYear(yearHint, seedValue) {
        const year = Number(yearHint);
        if (!Number.isFinite(year) || year < 1900 || year > 2200) {
            return {
                iso: "",
                display: ""
            };
        }

        const daysInYear = isLeapYear(year) ? 366 : 365;
        const dayOffset = stableHash(seedValue) % daysInYear;
        const date = new Date(Date.UTC(year, 0, 1 + dayOffset));
        const yyyy = String(date.getUTCFullYear());
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        return {
            iso: `${yyyy}-${mm}-${dd}`,
            display: `${mm}/${dd}/${yyyy}`
        };
    }

    function buildImportHistoryId(sourceKey) {
        const hash = stableHash(sourceKey).toString(36);
        const suffix = cleanText(sourceKey)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(-48);
        return cleanText(`import-${hash}${suffix ? `-${suffix}` : ""}`);
    }

    function normalizePhone(value) {
        const raw = cleanText(value);
        if (!raw) return "";

        let digits = raw.replace(/[^0-9]/g, "");
        if (!digits && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) {
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
                digits = String(Math.round(parsed));
            }
        } else if (/e[+-]?\d+/i.test(raw)) {
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
                digits = String(Math.round(parsed));
            }
        }

        digits = digits.replace(/^63(?=\d{10}$)/, "0");
        if (digits.length === 10 && digits.charAt(0) === "9") {
            digits = `0${digits}`;
        }

        return digits;
    }

    function normalizeAmount(value) {
        const raw = cleanText(value);
        if (!raw) return "";

        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return raw;
        if (Number.isInteger(parsed)) return String(parsed);
        return parsed.toFixed(2).replace(/\.00$/, "");
    }

    function formatIsoDate(year, month, day) {
        const yyyy = String(year).padStart(4, "0");
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return {
            iso: `${yyyy}-${mm}-${dd}`,
            display: `${mm}/${dd}/${yyyy}`
        };
    }

    function isValidDateParts(year, month, day) {
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
        if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
        const date = new Date(Date.UTC(y, m - 1, d));
        return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    }

    function parseImportDate(value) {
        const raw = cleanText(value);
        if (!raw) return null;

        const serial = Number(raw);
        if (/^\d+(\.\d+)?$/.test(raw) && Number.isFinite(serial) && serial > 20000 && serial < 90000) {
            const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
            return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
        }

        let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (match && isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3]))) {
            return formatIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
        }

        match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (match) {
            const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
            const month = Number(match[1]);
            const day = Number(match[2]);
            if (isValidDateParts(year, month, day)) {
                return formatIsoDate(year, month, day);
            }
        }

        return null;
    }

    function cleanNameToken(value) {
        return cleanText(value).replace(/^[,;]+|[,;]+$/g, "");
    }

    function normalizeNameToken(value) {
        return cleanNameToken(value).toLowerCase().replace(/\.+$/g, "");
    }

    function stripLeadingNameTokens(tokens) {
        const working = Array.isArray(tokens) ? tokens.slice() : [];
        while (working.length && LEADING_NAME_TOKENS.has(normalizeNameToken(working[0]))) {
            working.shift();
        }
        return working;
    }

    function detectCompoundLastNameLength(tokens) {
        const working = Array.isArray(tokens) ? tokens : [];
        if (working.length >= 3) {
            const threeTokenCandidate = [
                normalizeNameToken(working[working.length - 3]),
                normalizeNameToken(working[working.length - 2])
            ];
            const threeTokenMatch = MULTI_TOKEN_LAST_NAME_PARTICLES.find(function (candidate) {
                return candidate[0] === threeTokenCandidate[0] && candidate[1] === threeTokenCandidate[1];
            });
            if (threeTokenMatch) {
                return 3;
            }
        }

        if (working.length >= 2) {
            const secondToLast = normalizeNameToken(working[working.length - 2]);
            if (SINGLE_TOKEN_LAST_NAME_PARTICLES.has(secondToLast)) {
                return 2;
            }
        }

        return 1;
    }

    function joinNameTokens(tokens) {
        return cleanText((Array.isArray(tokens) ? tokens : []).join(" "));
    }

    function splitNameTokens(value) {
        return cleanText(value)
            .split(/\s+/)
            .map(cleanNameToken)
            .filter(function (token) {
                return /[a-z0-9]/i.test(stripDiacritics(token));
            });
    }

    function titleCaseToken(token, index) {
        const text = cleanText(token);
        if (!text) return "";

        const normalized = normalizeNameToken(text);
        if (!normalized) return "";
        if (index > 0 && LOWERCASE_NAME_PARTICLES.has(normalized)) {
            return normalized;
        }

        return text.split(/([-'])/).map(function (part) {
            if (part === "-" || part === "'") return part;
            const plain = part.replace(/[^A-Za-z0-9]/g, "");
            if (!plain) return part;
            if (plain.length <= 2) {
                return part.toUpperCase();
            }
            const lowered = part.toLowerCase();
            return lowered.charAt(0).toUpperCase() + lowered.slice(1);
        }).join("");
    }

    function toTitleCaseName(value) {
        return splitNameTokens(value).map(function (token, index) {
            return titleCaseToken(token, index);
        }).filter(Boolean).join(" ");
    }

    function isBlankSentinel(value) {
        return BLANK_SENTINELS.has(normalizeCompareText(value));
    }

    function cleanLeaderName(value) {
        const raw = cleanText(value);
        if (!raw || isBlankSentinel(raw)) return "";

        const stripped = cleanText(
            raw
                .replace(LEADER_ROLE_PREFIXES, " ")
                .replace(/\s*-\s*[A-Za-z][A-Za-z.\s()]*$/g, "")
        );
        if (!stripped || isBlankSentinel(stripped)) return "";

        const alias = LEADER_NAME_ALIASES[normalizeCompareText(stripped)];
        if (alias) return alias;

        return toTitleCaseName(stripped);
    }

    function parseNameParts(rawName) {
        const raw = cleanText(rawName);
        if (!raw) {
            return {
                rawName: "",
                firstName: "",
                middleName: "",
                lastName: ""
            };
        }

        if (raw.indexOf(",") !== -1) {
            const parts = raw.split(",");
            const lastName = cleanText(parts.shift());
            const remainder = cleanText(parts.join(" "));
            const tokens = stripLeadingNameTokens(splitNameTokens(remainder));
            return {
                rawName: raw,
                firstName: tokens.shift() || "",
                middleName: tokens.join(" "),
                lastName: lastName
            };
        }

        const tokens = stripLeadingNameTokens(splitNameTokens(raw));
        if (tokens.length === 1) {
            return {
                rawName: raw,
                firstName: tokens[0],
                middleName: "",
                lastName: ""
            };
        }

        let suffix = "";
        let working = tokens.slice();
        const lastToken = working[working.length - 1];
        if (SUFFIX_TOKENS.has(String(lastToken || "").toUpperCase())) {
            suffix = working.pop();
        }

        const compoundLastNameLength = detectCompoundLastNameLength(working);
        const lastNameTokens = compoundLastNameLength > 1
            ? working.splice(Math.max(working.length - compoundLastNameLength, 0), compoundLastNameLength)
            : [working.pop() || ""];
        const givenTokens = working;
        let firstTokens = [];
        let middleTokens = [];

        if (givenTokens.length <= 1) {
            firstTokens = givenTokens.slice();
        } else if (givenTokens.length === 2) {
            firstTokens = [givenTokens[0]];
            middleTokens = [givenTokens[1]];
        } else if (givenTokens.length === 3 && SINGLE_TOKEN_LAST_NAME_PARTICLES.has(normalizeNameToken(givenTokens[1]))) {
            firstTokens = [givenTokens[0]];
            middleTokens = givenTokens.slice(1);
        } else {
            firstTokens = givenTokens.slice(0, -1);
            middleTokens = [givenTokens[givenTokens.length - 1]];
        }

        return {
            rawName: raw,
            firstName: joinNameTokens(firstTokens),
            middleName: joinNameTokens(middleTokens),
            lastName: cleanText(`${joinNameTokens(lastNameTokens)} ${suffix}`)
        };
    }

    function buildDisplayName(parts) {
        if (!parts) return "";
        const lastName = cleanText(parts.lastName);
        const firstName = cleanText(parts.firstName);
        const middleName = cleanText(parts.middleName);
        const naturalName = buildNaturalName(parts);

        if (!lastName && !firstName && !middleName) {
            return cleanText(parts.rawName || "");
        }

        if (!lastName) return naturalName;
        return cleanText(
            `${lastName}${firstName ? `, ${firstName}` : ""}${middleName ? ` ${middleName}` : ""}`
        );
    }

    function buildNaturalName(parts) {
        if (!parts) return "";
        const firstName = cleanText(parts.firstName);
        const middleName = cleanText(parts.middleName);
        const lastName = cleanText(parts.lastName);
        const raw = cleanText(parts.rawName);
        const natural = cleanText(`${firstName} ${middleName} ${lastName}`);
        return natural || raw;
    }

    function createAliasSet() {
        const aliases = new Set();
        for (let index = 0; index < arguments.length; index += 1) {
            const normalized = normalizeCompareText(arguments[index]);
            if (normalized) aliases.add(normalized);
        }
        return aliases;
    }

    function getRecordAliases(record) {
        const source = record || {};
        const rawName = cleanText(source.name);
        const lastName = cleanText(source.lastName);
        const firstName = cleanText(source.firstName);
        const middleName = cleanText(source.middleName);

        return createAliasSet(
            rawName,
            buildDisplayName({
                rawName: rawName,
                firstName: firstName,
                middleName: middleName,
                lastName: lastName
            }),
            buildNaturalName({
                rawName: rawName,
                firstName: firstName,
                middleName: middleName,
                lastName: lastName
            })
        );
    }

    function getImportedAliases(item) {
        return createAliasSet(
            item && item.rawName,
            item && item.displayName,
            item && item.naturalName
        );
    }

    function buildMatchIndex(records) {
        const index = new Map();
        (Array.isArray(records) ? records : []).forEach(function (record) {
            getRecordAliases(record).forEach(function (alias) {
                if (!index.has(alias)) {
                    index.set(alias, []);
                }
                index.get(alias).push(record);
            });
        });
        return index;
    }

    function uniqueObjectList(list) {
        return Array.from(new Set(Array.isArray(list) ? list : []));
    }

    function findMatchingRecord(item, matchIndex) {
        const aliases = getImportedAliases(item);
        let candidates = [];

        aliases.forEach(function (alias) {
            if (!matchIndex.has(alias)) return;
            candidates = candidates.concat(matchIndex.get(alias));
        });

        const uniqueCandidates = uniqueObjectList(candidates);
        if (!uniqueCandidates.length) return null;
        if (uniqueCandidates.length === 1) return uniqueCandidates[0];

        const importedContact = cleanText(item && item.contact);
        if (importedContact) {
            const exactContact = uniqueCandidates.filter(function (record) {
                return cleanText(record && record.contact) === importedContact;
            });
            if (exactContact.length) return exactContact[0];
        }

        const importedBarangay = normalizeCompareText(item && item.barangay);
        if (importedBarangay) {
            const exactBarangay = uniqueCandidates.filter(function (record) {
                return normalizeCompareText(record && record.barangay) === importedBarangay;
            });
            if (exactBarangay.length) return exactBarangay[0];
        }

        return uniqueCandidates[0];
    }

    function hasMeaningfulValue(value) {
        if (Array.isArray(value)) return value.length > 0;
        return cleanText(value) !== "";
    }

    function fillIfMissing(target, key, value) {
        if (!target) return;
        if (!hasMeaningfulValue(value)) return;
        if (hasMeaningfulValue(target[key])) return;
        target[key] = value;
    }

    function rowToHeaderMap(row) {
        const map = {};
        (Array.isArray(row) ? row : []).forEach(function (value, index) {
            const normalized = normalizeHeader(value);
            if (!normalized) return;
            if (map[normalized] == null) {
                map[normalized] = index;
            }
        });
        return map;
    }

    function hasHeader(headerMap, names) {
        const list = Array.isArray(names) ? names : [names];
        return list.some(function (name) {
            return headerMap[normalizeHeader(name)] != null;
        });
    }

    function getMissingTemplateHeaders(headerMap) {
        return TEMPLATE_HEADER_GROUPS
            .filter(function (group) {
                return !hasHeader(headerMap, group.names);
            })
            .map(function (group) {
                return {
                    label: group.label,
                    required: !!group.required
                };
            });
    }

    function scoreHeaderRow(row) {
        const headerMap = rowToHeaderMap(row);
        let score = 0;

        if (SUPPORTED_NAME_HEADERS.some(function (header) { return headerMap[header] != null; })) score += 5;
        if (headerMap.BARANGAY != null) score += 1;
        if (headerMap["TYPE OF ASSISTANCE"] != null) score += 1;
        if (headerMap["ASSISTANCE PROVIDED"] != null) score += 1;
        if (headerMap["COMPLETE ADDRESS"] != null || headerMap["PUROK/STREET"] != null || headerMap["HOUSE NUMBER/BLOCK/LOT"] != null) {
            score += 1;
        }

        return {
            score: score,
            headerMap: headerMap
        };
    }

    function detectSupportedSheet(sheet) {
        const rows = Array.isArray(sheet && sheet.rows) ? sheet.rows : [];
        let best = null;

        for (let index = 0; index < Math.min(rows.length, 5); index += 1) {
            const candidate = scoreHeaderRow(rows[index]);
            if (!best || candidate.score > best.score) {
                best = {
                    score: candidate.score,
                    headerMap: candidate.headerMap,
                    headerRowIndex: index
                };
            }
        }

        if (!best || best.score < 5) return null;
        return best;
    }

    function inferClientStatusColumn(rows, headerRowIndex, headerMap) {
        if (!Array.isArray(rows) || !rows.length) return -1;
        if (headerMap["CLIENT STATUS"] != null) return headerMap["CLIENT STATUS"];

        const maxCols = rows.reduce(function (max, row) {
            return Math.max(max, Array.isArray(row) ? row.length : 0);
        }, 0);

        let bestIndex = -1;
        let bestScore = 0;

        for (let columnIndex = 0; columnIndex < maxCols; columnIndex += 1) {
            let nonEmpty = 0;
            let matches = 0;

            for (let rowIndex = headerRowIndex + 1; rowIndex < Math.min(rows.length, headerRowIndex + 40); rowIndex += 1) {
                const value = cleanText(rows[rowIndex] && rows[rowIndex][columnIndex]);
                if (!value) continue;
                nonEmpty += 1;
                if (normalizeClientTag(value)) {
                    matches += 1;
                }
            }

            if (matches >= 3 && matches > bestScore && matches === nonEmpty) {
                bestIndex = columnIndex;
                bestScore = matches;
            }
        }

        return bestIndex;
    }

    function getByHeader(row, headerMap, names) {
        const rowValues = Array.isArray(row) ? row : [];
        const normalizedNames = Array.isArray(names) ? names : [names];

        for (let index = 0; index < normalizedNames.length; index += 1) {
            const key = normalizeHeader(normalizedNames[index]);
            const columnIndex = headerMap[key];
            if (columnIndex == null) continue;
            const value = cleanText(rowValues[columnIndex]);
            if (value) return value;
        }

        return "";
    }

    function deriveOffice(referralSource) {
        const normalized = normalizeCompareText(referralSource);
        if (!normalized) return "";
        if (normalized.indexOf("cnl") !== -1) return "CNL";
        if (normalized.indexOf("pdl") !== -1) return "PDL";
        return "";
    }

    function deriveFirstContact(referralSource) {
        const normalized = normalizeCompareText(referralSource);
        if (!normalized) return "";
        if (normalized.indexOf("cityhall") !== -1 || normalized.indexOf("city hall") !== -1) {
            return "City Hall Office";
        }
        if (normalized.indexOf("tgp walk in") !== -1 || normalized.indexOf("walk in tgp office") !== -1) {
            return "TGP Office - Brgy. Milagrosa";
        }
        if (normalized.indexOf("group chat") !== -1 || normalized.indexOf("online") !== -1) {
            return "Online";
        }
        return "";
    }

    function deriveHouseNumber(completeAddress, addressLine, explicitHouseNumber) {
        const direct = cleanText(explicitHouseNumber);
        if (direct) return direct;

        const complete = cleanText(completeAddress);
        const address = cleanText(addressLine);
        if (!complete || !address) return "";
        if (normalizeCompareText(complete) === normalizeCompareText(address)) return "";
        return complete;
    }

    function normalizeProgramValue(assistanceType) {
        const raw = cleanText(assistanceType);
        if (!raw) return "";

        const normalized = normalizeCompareText(raw);
        const labelMap = {
            "hospital bill": "Hospital Bill",
            "laboratory medical procedure": "Laboratory/Medical Procedure",
            "eye glass": "Eye glass",
            "eye center": "Transport Service - Medical Client",
            "medicine": "Medicine"
        };
        return labelMap[normalized] || raw;
    }

    function chooseSelectedProgram(assistanceProvided, assistanceType) {
        const normalizedType = normalizeProgramValue(assistanceType);
        if (normalizedType) return normalizedType;

        const provided = normalizeCompareText(assistanceProvided);
        if (provided.indexOf("transport") !== -1 || provided.indexOf("eye center") !== -1) {
            return "Transport Service - Medical Client";
        }
        if (
            provided.indexOf("tgp") !== -1
            || provided.indexOf("dswd") !== -1
            || provided.indexOf("op") !== -1
        ) {
            return "Medical Financial Assistance (Cash)";
        }

        return cleanText(assistanceProvided || assistanceType || "Imported Assistance");
    }

    function deriveTypeCategory(selectedProgram) {
        return PROGRAM_TYPE_BY_SELECTION[cleanText(selectedProgram)] || "";
    }

    function deriveRequestingFor(assistanceProvided) {
        const normalized = normalizeCompareText(assistanceProvided);
        if (!normalized) return "";
        if (normalized.indexOf("tgp") !== -1) return "TGP Partylist";
        if (normalized.indexOf("dswd") !== -1) return "DSWD Regional";
        if (normalized.indexOf("op") !== -1) return "Malacanang / Office of the President";
        if (normalized.indexOf("senator") !== -1) return "Other: Senators Only";
        return "";
    }

    function derivePatientStatus(programValue) {
        const normalized = normalizeCompareText(programValue);
        if (!normalized) return "";
        if (normalized.indexOf("hospital bill") !== -1) {
            return "Admitted sa hospital";
        }
        if (
            normalized.indexOf("laboratory medical procedure") !== -1
            || normalized.indexOf("eye glass") !== -1
            || normalized.indexOf("eye center") !== -1
            || normalized.indexOf("medicine") !== -1
        ) {
            return "Out Patient o hindi na admitted";
        }
        return "";
    }

    function buildImportRemark(item) {
        const parts = [`Imported from Excel (${item.fileName}, ${item.sheetName} row ${item.rowNumber})`];
        if (item.referralSource) parts.push(`Source: ${item.referralSource}`);
        if (item.clientTag) parts.push(`Client Tag: ${item.clientTag}`);
        if (item.assistanceType && normalizeCompareText(item.assistanceType) !== normalizeCompareText(item.importedType)) {
            parts.push(`Detail: ${item.assistanceType}`);
        }
        if (item.amount) parts.push(`Amount: ${item.amount}`);
        return parts.join(" | ");
    }

    function getNormalizedSheetName(value) {
        return normalizeCompareText(value);
    }

    function shouldImportSheet(sheetName, options) {
        const allowed = Array.isArray(options && options.sheetNames)
            ? options.sheetNames.map(getNormalizedSheetName).filter(Boolean)
            : [];
        if (!allowed.length) return true;
        return allowed.indexOf(getNormalizedSheetName(sheetName)) !== -1;
    }

    function getSheetRowBoundary(options, sheetName, directKey, bySheetKey, fallbackValue) {
        const opts = options || {};
        if (opts && typeof opts[bySheetKey] === "object" && opts[bySheetKey] !== null) {
            const direct = opts[bySheetKey][sheetName];
            if (Number.isFinite(Number(direct)) && Number(direct) > 0) {
                return Number(direct);
            }

            const normalizedSheetName = getNormalizedSheetName(sheetName);
            const matchingKey = Object.keys(opts[bySheetKey]).find(function (key) {
                return getNormalizedSheetName(key) === normalizedSheetName;
            });
            if (matchingKey) {
                const candidate = opts[bySheetKey][matchingKey];
                if (Number.isFinite(Number(candidate)) && Number(candidate) > 0) {
                    return Number(candidate);
                }
            }
        }

        if (Number.isFinite(Number(opts[directKey])) && Number(opts[directKey]) > 0) {
            return Number(opts[directKey]);
        }

        return fallbackValue;
    }

    function getSheetRowLimit(options, sheetName) {
        return getSheetRowBoundary(options, sheetName, "maxRowNumber", "maxRowNumberBySheet", Number.POSITIVE_INFINITY);
    }

    function getSheetRowStart(options, sheetName) {
        return getSheetRowBoundary(options, sheetName, "minRowNumber", "minRowNumberBySheet", 1);
    }

    function buildImportedRows(workbook, fileName, options) {
        const supportedSheets = [];
        const importedRows = [];
        const skippedSheets = [];

        (Array.isArray(workbook && workbook.sheets) ? workbook.sheets : []).forEach(function (sheet) {
            if (!shouldImportSheet(sheet && sheet.name, options)) {
                return;
            }

            const detection = detectSupportedSheet(sheet);
            if (!detection) {
                skippedSheets.push(sheet && sheet.name ? sheet.name : "Unnamed Sheet");
                return;
            }

            const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
            const headerMap = detection.headerMap;
            const headerRowIndex = detection.headerRowIndex;
            const missingTemplateHeaders = getMissingTemplateHeaders(headerMap);
            const clientStatusColumnIndex = inferClientStatusColumn(rows, headerRowIndex, headerMap);
            const referralSourceColumnIndex = headerMap["REFERRAL SOURCE"] != null
                ? headerMap["REFERRAL SOURCE"]
                : ((rows[headerRowIndex] && cleanText(rows[headerRowIndex][0]) === "") ? 0 : -1);
            const minRowNumber = getSheetRowStart(options, sheet.name);
            const maxRowNumber = getSheetRowLimit(options, sheet.name);
            const firstRowIndex = Math.max(headerRowIndex + 1, Math.max(minRowNumber - 1, 0));
            const lastRowIndex = Number.isFinite(maxRowNumber)
                ? Math.min(rows.length - 1, Math.max(maxRowNumber - 1, headerRowIndex))
                : rows.length - 1;
            let importedCount = 0;

            for (let rowIndex = firstRowIndex; rowIndex <= lastRowIndex; rowIndex += 1) {
                const row = rows[rowIndex];
                const rawName = getByHeader(row, headerMap, SUPPORTED_NAME_HEADERS);
                if (!rawName) continue;

                const nameParts = parseNameParts(rawName);
                const assistanceProvided = getByHeader(row, headerMap, "ASSISTANCE PROVIDED");
                const assistanceType = getByHeader(row, headerMap, "TYPE OF ASSISTANCE");
                const selectedProgram = chooseSelectedProgram(assistanceProvided, assistanceType);
                const explicitRequestDate = parseImportDate(getByHeader(row, headerMap, ["DATE REQUESTED", "REQUESTED DATE", "DATE"]));
                const completeAddress = getByHeader(row, headerMap, "COMPLETE ADDRESS");
                const addressLine = getByHeader(row, headerMap, "PUROK/STREET") || completeAddress;
                const subdivision = getByHeader(row, headerMap, ["SUBDIVSION/VILLAGE/COMPOUND", "SUBDIVISION/VILLAGE/COMPOUND"]);
                const houseNumber = getByHeader(row, headerMap, "HOUSE NUMBER/BLOCK/LOT");
                const barangay = getByHeader(row, headerMap, "BARANGAY");
                const leader = cleanLeaderName(getByHeader(row, headerMap, ["NAME OF LEADER/VIP/PARTNER", "NAME OF LEADER/VIP"]));
                const organizationName = getByHeader(row, headerMap, "ORGANIZATION");
                const contact = normalizePhone(getByHeader(row, headerMap, ["CONTACT NUMBER PATIENT", "CONTACT NUMBER"]));
                const amount = normalizeAmount(getByHeader(row, headerMap, "AMOUNT"));
                const referralSource = referralSourceColumnIndex >= 0 ? cleanText(row && row[referralSourceColumnIndex]) : "";
                const clientTag = clientStatusColumnIndex >= 0 ? normalizeClientTag(row && row[clientStatusColumnIndex]) : "";
                const yearHint = extractYearHint(fileName, sheet.name);
                const rowNumber = rowIndex + 1;
                const sourceKey = `${fileName}::${sheet.name}::${rowNumber}`;
                const requestDate = explicitRequestDate || createDeterministicDateInYear(yearHint, sourceKey);

                importedRows.push({
                    fileName: fileName,
                    sheetName: sheet.name,
                    rowNumber: rowNumber,
                    sourceKey: sourceKey,
                    historyEntryId: buildImportHistoryId(sourceKey),
                    dateRequested: requestDate.iso,
                    requestedDate: requestDate.display,
                    rawName: rawName,
                    firstName: nameParts.firstName,
                    middleName: nameParts.middleName,
                    lastName: nameParts.lastName,
                    displayName: buildDisplayName(nameParts),
                    naturalName: buildNaturalName(nameParts),
                    selectedProgram: selectedProgram,
                    importedType: selectedProgram,
                    typeCategory: deriveTypeCategory(selectedProgram),
                    assistanceProvided: assistanceProvided,
                    assistanceType: assistanceType,
                    completeAddress: completeAddress,
                    addressLine: addressLine,
                    houseNo: deriveHouseNumber(completeAddress, addressLine, houseNumber),
                    subdivision: subdivision,
                    barangay: barangay,
                    leader: leader,
                    organizationName: organizationName,
                    contact: contact,
                    amount: amount,
                    referralSource: referralSource,
                    firstContact: deriveFirstContact(referralSource),
                    office: deriveOffice(referralSource),
                    clientTag: clientTag,
                    clientClass: organizationName ? "Organizational Sectors" : "Regular Client",
                    requestingFor: deriveRequestingFor(assistanceProvided),
                    patientStatus: derivePatientStatus(selectedProgram),
                    yearHint: yearHint,
                    importRemark: ""
                });

                importedCount += 1;
            }

            supportedSheets.push({
                name: sheet.name,
                rowCount: importedCount,
                missingTemplateHeaders: missingTemplateHeaders
            });
        });

        importedRows.forEach(function (item) {
            item.importRemark = buildImportRemark(item);
        });

        return {
            fileName: fileName,
            rows: importedRows,
            supportedSheets: supportedSheets,
            skippedSheets: skippedSheets
        };
    }

    function createBaseRecord(item) {
        const recordName = item.displayName || item.rawName;
        const initialHistory = createHistoryEntry(item, recordName);
        return {
            month: item.requestedDate || "",
            dateRequested: item.dateRequested || "",
            requestedDate: item.requestedDate || "",
            glcode: "",
            lastName: item.lastName || "",
            firstName: item.firstName || "",
            middleName: item.middleName || "",
            name: recordName,
            type: item.typeCategory || deriveTypeCategory(item.importedType),
            programs: cleanText(item.selectedProgram || item.importedType) ? [cleanText(item.selectedProgram || item.importedType)] : [],
            office: item.office || "",
            first_contact: item.firstContact || "",
            first_staff: "",
            client_class: item.clientClass || "",
            client_class_other: "",
            organization_name: item.organizationName || "",
            position: "",
            guarantee_hospital: "",
            guarantee_purpose: "",
            guarantee_amount: item.amount || "",
            houseNo: item.houseNo || "",
            address: item.addressLine || "",
            subdivisionVillageCompound: item.subdivision || "",
            barangay: item.barangay || "",
            contact: item.contact || "",
            email: "",
            gender: "",
            birthday: "",
            status: "",
            requesting_for: item.requestingFor || "",
            patient_status: item.patientStatus || "",
            client_times: item.clientTag || "",
            hospital: "",
            date_of_assistance: "",
            leaderBarangayOfficial: item.leader || "",
            org_long_name: "",
            num_attendees: "",
            other_details: "",
            event_date: "",
            event_name: "",
            event_place: "",
            event_time: "",
            upload_letter_meta: null,
            remarks: item.importRemark || "",
            history: initialHistory.importSourceKey ? [initialHistory] : [],
            latestTransport: "",
            oldestTransport: "",
            importedFromExcel: true,
            importSourceKey: item.sourceKey,
            importFileName: item.fileName,
            importSheetName: item.sheetName,
            importRowNumber: item.rowNumber
        };
    }

    function createHistoryEntry(item, recordName) {
        return {
            id: cleanText(item.historyEntryId || buildImportHistoryId(item.sourceKey)),
            name: cleanText(recordName) || item.displayName || item.rawName,
            glcode: "",
            date: item.dateRequested || "",
            dateCompleted: "",
            dateReleased: "",
            type: item.typeCategory || deriveTypeCategory(item.importedType),
            status: "",
            program: cleanText(item.selectedProgram || item.importedType),
            leader: item.leader || "",
            first_contact: item.firstContact || "",
            client_class: item.clientClass || "",
            office: item.office || "",
            guarantee_amount: item.amount || "",
            requesting_for: item.requestingFor || "",
            patient_status: item.patientStatus || "",
            client_times: item.clientTag || "",
            hospital: "",
            remarks: item.importRemark || "",
            imported: true,
            importSourceKey: item.sourceKey,
            importFileName: item.fileName,
            importSheetName: item.sheetName,
            importRowNumber: item.rowNumber
        };
    }

    function recordHasSourceKey(record, sourceKey) {
        if (!record || !sourceKey) return false;
        if (cleanText(record.importSourceKey) === sourceKey) return true;
        return (Array.isArray(record.history) ? record.history : []).some(function (entry) {
            return cleanText(entry && entry.importSourceKey) === sourceKey;
        });
    }

    function mergeImportedRecord(target, item) {
        if (!target || !item) {
            return { historyAdded: false, skippedAsDuplicate: false };
        }

        if (recordHasSourceKey(target, item.sourceKey)) {
            return { historyAdded: false, skippedAsDuplicate: true };
        }

        if (!Array.isArray(target.history)) {
            target.history = [];
        }

        fillIfMissing(target, "lastName", item.lastName);
        fillIfMissing(target, "firstName", item.firstName);
        fillIfMissing(target, "middleName", item.middleName);
        fillIfMissing(target, "name", item.displayName || item.rawName);
        fillIfMissing(target, "type", item.typeCategory || deriveTypeCategory(item.importedType));
        if ((!Array.isArray(target.programs) || !target.programs.length) && cleanText(item.selectedProgram || item.importedType)) {
            target.programs = [cleanText(item.selectedProgram || item.importedType)];
        }
        fillIfMissing(target, "office", item.office);
        fillIfMissing(target, "first_contact", item.firstContact);
        fillIfMissing(target, "client_class", item.clientClass);
        fillIfMissing(target, "organization_name", item.organizationName);
        fillIfMissing(target, "guarantee_amount", item.amount);
        fillIfMissing(target, "houseNo", item.houseNo);
        fillIfMissing(target, "address", item.addressLine);
        fillIfMissing(target, "subdivisionVillageCompound", item.subdivision);
        fillIfMissing(target, "barangay", item.barangay);
        fillIfMissing(target, "contact", item.contact);
        fillIfMissing(target, "leaderBarangayOfficial", item.leader);
        fillIfMissing(target, "requesting_for", item.requestingFor);
        fillIfMissing(target, "patient_status", item.patientStatus);
        fillIfMissing(target, "client_times", item.clientTag);
        fillIfMissing(target, "remarks", item.importRemark);

        target.history.push(createHistoryEntry(item, target.name));

        return { historyAdded: true, skippedAsDuplicate: false };
    }

    function cloneRecord(record) {
        return JSON.parse(JSON.stringify(record || {}));
    }

    function buildImportChanges(existingRecords, importedRows) {
        const creates = [];
        const updateMap = new Map();
        const workingRecords = (Array.isArray(existingRecords) ? existingRecords : []).map(cloneRecord);
        const matchIndex = buildMatchIndex(workingRecords);
        const stats = {
            totalRows: Array.isArray(importedRows) ? importedRows.length : 0,
            created: 0,
            updated: 0,
            historyAdded: 0,
            duplicateSkipped: 0
        };

        (Array.isArray(importedRows) ? importedRows : []).forEach(function (item) {
            const match = findMatchingRecord(item, matchIndex);
            if (!match) {
                const created = createBaseRecord(item);
                creates.push(created);
                workingRecords.push(created);
                getRecordAliases(created).forEach(function (alias) {
                    if (!matchIndex.has(alias)) {
                        matchIndex.set(alias, []);
                    }
                    matchIndex.get(alias).push(created);
                });
                stats.created += 1;
                return;
            }

            const mergeResult = mergeImportedRecord(match, item);
            if (mergeResult.skippedAsDuplicate) {
                stats.duplicateSkipped += 1;
                return;
            }

            if (mergeResult.historyAdded) {
                stats.historyAdded += 1;
            }

            if (match.id != null) {
                updateMap.set(String(match.id), match);
            }
        });

        stats.updated = updateMap.size;

        return {
            creates: creates,
            updates: Array.from(updateMap.values()),
            stats: stats
        };
    }

    async function parseFile(file, options) {
        if (!(root.lbXlsxLite && typeof root.lbXlsxLite.parseFile === "function")) {
            throw new Error("Excel import parser is unavailable.");
        }

        const workbook = await root.lbXlsxLite.parseFile(file);
        return buildImportedRows(workbook, file && file.name ? file.name : "Workbook.xlsx", options);
    }

    return {
        buildImportChanges: buildImportChanges,
        buildImportedRows: buildImportedRows,
        getTemplateHeaders: function () {
            return TEMPLATE_HEADERS.slice();
        },
        parseFile: parseFile
    };
});
