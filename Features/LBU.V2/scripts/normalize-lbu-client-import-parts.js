#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARTS_DIR = path.resolve(PROJECT_ROOT, "supabase", "lbu-client-import-parts");
const PART_NUMBERS = Array.from({ length: 22 }, (_, index) => index + 1);
const SHOULD_WRITE = process.argv.includes("--write");

const PERSON_LOWERCASE_TOKENS = new Set([
    "de",
    "del",
    "dela",
    "delos",
    "delas",
    "la",
    "las",
    "los",
    "van",
    "von",
    "bin",
    "ibn",
    "du"
]);

const GENERIC_UPPERCASE_TOKENS = new Map([
    ["cnl", "CNL"],
    ["pdl", "PDL"],
    ["cswdo", "CSWDO"],
    ["doh4a", "DOH4A"],
    ["mcdc", "MCDC"],
    ["pnr", "PNR"],
    ["cvl", "CVL"],
    ["gk", "GK"],
    ["dns", "DNS"],
    ["dne", "D.N.E."],
    ["jj", "JJ"],
    ["tgp", "TGP"],
    ["dswd", "DSWD"],
    ["op", "OP"],
    ["le", "L.E."],
    ["l.e.", "L.E."]
]);

const TITLE_REPLACEMENTS = [
    [/\bBrgy\b\.?/gi, "Brgy."],
    [/\bBarangay\b/gi, "Barangay"],
    [/\bSubd(?:ivision)?\b\.?/gi, "Subd."],
    [/\bCmpd\b\.?/gi, "Compound"],
    [/\bComp\b\.?/gi, "Compound"],
    [/\bVillage\b/gi, "Village"],
    [/\bHomes\b/gi, "Homes"],
    [/\bResidence\b/gi, "Residence"],
    [/\bResidences\b/gi, "Residences"],
    [/\bCompound\b/gi, "Compound"],
    [/\bPhase\b/gi, "Phase"],
    [/\bPh\b\.?\s*(\d+)/gi, "Phase $1"],
    [/\bBlk\b\.?/gi, "Blk"],
    [/\bBlock\b/gi, "Block"],
    [/\bLot\b/gi, "Lot"],
    [/\bLt\b\.?/gi, "Lot"],
    [/\bSt\b\.?/gi, "St."],
    [/\bStreet\b/gi, "Street"],
    [/\bAve\b\.?/gi, "Ave."],
    [/\bRd\b\.?/gi, "Rd."],
    [/\bBo\b\.?/gi, "Bo."],
    [/\bMt\b\.?/gi, "Mt."],
    [/\bGen\b\.?/gi, "Gen."],
    [/\bMa\b\.?(?=\s)/gi, "Ma."],
    [/\bLazer\b/gi, "Lazer"],
    [/\bRamadahomes\b/gi, "Ramada Homes"],
    [/\bSouthwund\b/gi, "Southwind"],
    [/\bSouthwynd\b/gi, "Southwind"],
    [/\bMajogany\b/gi, "Mahogany"],
    [/\bBamboo Groove\b/gi, "Bamboo Grove"],
    [/\bElazigue\b/gi, "Elazegui"],
    [/\bElazequi\b/gi, "Elazegui"],
    [/\bCalamba Park Residence\b/gi, "Calamba Park Residences"],
    [/\bBria\b(?!\s+Homes)/gi, "Bria Homes"],
    [/\bCamp V\.?\s*Lim\b/gi, "Camp Vicente Lim"],
    [/\bL E\b/gi, "L.E."],
    [/\bL\.E\b(?!\.)/gi, "L.E."],
    [/\bL\.E\.\s*Village\b/gi, "L.E. Village"],
    [/\bL\.E\.\s*Ii\b/gi, "L.E. II"],
    [/\bSitio\b/gi, "Sitio"],
    [/\bPurok\b/gi, "Purok"]
];

function loadAssetValue(filePath, expression) {
    const source = fs.readFileSync(filePath, "utf8");
    const context = {
        console: console,
        document: {
            getElementById: function () { return null; },
            readyState: "loading"
        },
        window: {}
    };
    vm.createContext(context);
    vm.runInContext(`${source}\nthis.__assetValue = ${expression};`, context);
    return context.__assetValue;
}

const BARANGAYS = loadAssetValue(
    path.resolve(PROJECT_ROOT, "assets", "js", "barangays.js"),
    "BARANGAYS"
);
const PUROKS = loadAssetValue(
    path.resolve(PROJECT_ROOT, "assets", "js", "puroks.js"),
    "typeof PUROKS !== 'undefined' ? PUROKS : window.PUROKS"
);

const OFFICIAL_LOCATION_SUPPLEMENTS = {
    "Barangay 3 (Poblacion)": [
        "Burgos",
        "Chipeco",
        "D.N.E.",
        "Elasigue I",
        "Elasigue II",
        "Elepano I",
        "Elepano II",
        "Kinsville",
        "Lazaro",
        "Leonor I",
        "Leonor II",
        "Pabalan"
    ],
    "Barangay 4 (Poblacion)": ["Callejon", "Pasilyo", "Villa Zenaida Subd."],
    "Barangay 5 (Poblacion)": [
        "Bandola Subd.",
        "Burgos St.",
        "Dennis I",
        "Dennis II",
        "Gen. Luna",
        "L.E. II Subdivision",
        "Lazer Comp.",
        "Mabini St.",
        "Market Site",
        "Villa Silangan"
    ],
    "Barangay 6 (Poblacion)": ["Calles", "Casanas", "Elepano", "Lopez J.", "Mercado", "Sitio Labar"],
    "Barangay 7 (Poblacion)": ["Belarmino", "Borja", "Burgos St.", "Juliano", "Ma. Soledad"]
};

const GLOBAL_SUBDIVISION_ALIASES = new Map([
    ["bria", "Bria Homes"],
    ["bamboo groove", "Bamboo Grove"],
    ["camp vicente lim", "Camp Vicente Lim"],
    ["camp v lim", "Camp Vicente Lim"],
    ["south ville", "Southville 6"],
    ["south ville 6", "Southville 6"],
    ["southville 6", "Southville 6"],
    ["south vill", "Southville 6"],
    ["le village", "L.E. Village"],
    ["l e village", "L.E. Village"],
    ["l.e village", "L.E. Village"],
    ["l.e. village", "L.E. Village"],
    ["lazer compound", "Lazer Compound"],
    ["lacer compound", "Lazer Compound"],
    ["majogany villas", "Mahogany Villas"],
    ["calamba park residence", "Calamba Park Residences"],
    ["southwind residences", "Southwind Residences"],
    ["southwynd residences", "Southwind Residences"],
    ["southwund", "Southwind"],
    ["calambeñ ville 2", "Calambeño Ville 2"],
    ["calambeno ville 2", "Calambeño Ville 2"],
    ["calambeño ville 2", "Calambeño Ville 2"],
    ["citadel", "Citadel"],
    ["citadel residences", "Citadel Residences"],
    ["silangan village", "Silangan Village"],
    ["sitio silangan village", "Silangan Village"]
]);

function cleanText(value) {
    return String(value == null ? "" : value)
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeCompareText(value) {
    return cleanText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isRomanNumeral(value) {
    return /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(value || "");
}

function romanToArabic(value) {
    const map = {
        i: "1",
        ii: "2",
        iii: "3",
        iv: "4",
        v: "5",
        vi: "6",
        vii: "7",
        viii: "8",
        ix: "9",
        x: "10"
    };
    return map[String(value || "").toLowerCase()] || value;
}

function replaceWordToken(token, index, options) {
    const value = String(token || "");
    if (!/[A-Za-z]/.test(value)) return value;

    const normalized = normalizeCompareText(value);
    if (!normalized) return value;

    if (options && options.person) {
        if (isRomanNumeral(value)) return value.toUpperCase();
        if (index > 0 && PERSON_LOWERCASE_TOKENS.has(normalized)) {
            return normalized;
        }
        if (normalized === "ma") return "Ma.";
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }

    if (GENERIC_UPPERCASE_TOKENS.has(normalized)) {
        return GENERIC_UPPERCASE_TOKENS.get(normalized);
    }
    if (isRomanNumeral(value)) return value.toUpperCase();
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function smartTitleCase(text, options) {
    const raw = cleanText(text);
    if (!raw) return "";

    let wordIndex = 0;
    let result = raw.replace(/[A-Za-z][A-Za-z'.&-]*/g, function (token) {
        const replaced = replaceWordToken(token, wordIndex, options || {});
        wordIndex += 1;
        return replaced;
    });

    TITLE_REPLACEMENTS.forEach(function (entry) {
        result = result.replace(entry[0], entry[1]);
    });

    result = result
        .replace(/\bPurok\s+([0-9]+)\s*-\s*([A-Za-z])\b/gi, "Purok $1-$2")
        .replace(/\bPurok\s+([0-9]+)([A-Za-z])\b/gi, "Purok $1$2")
        .replace(/\bBo\.\s*Cvl\b/gi, "Bo. CVL")
        .replace(/\bEm's\b/gi, "EM's")
        .replace(/\b([0-9]+)(St|Nd|Rd|Th)\b/g, function (match, number, suffix) {
            return `${number}${String(suffix).toLowerCase()}`;
        })
        .replace(/\bMa\.(?=[A-Za-z])/g, "Ma. ")
        .replace(/\bMa\.\s+([A-Za-z][A-Za-z.-]*)/g, function (match, word) {
            return `Ma. ${word.charAt(0).toUpperCase()}${word.slice(1)}`;
        });

    return cleanText(result);
}

function titleCasePerson(value) {
    return smartTitleCase(value, { person: true });
}

function buildBarangayLookup() {
    const lookup = new Map();

    BARANGAYS.forEach(function (barangay) {
        const canonical = cleanText(barangay);
        const normalized = normalizeCompareText(canonical);
        if (normalized) lookup.set(normalized, canonical);

        const poblacionMatch = canonical.match(/^Barangay\s+(\d+)\s+\(Poblacion\)$/i);
        if (poblacionMatch) {
            lookup.set(`poblacion ${poblacionMatch[1]}`, canonical);
            lookup.set(`barangay ${poblacionMatch[1]} poblacion`, canonical);
            lookup.set(`brgy ${poblacionMatch[1]}`, canonical);
        }
    });

    lookup.set("palo alto", "Palo-Alto");
    lookup.set("kay anlog", "Kay-Anlog");
    lookup.set("majada out", "Majada Out");
    lookup.set("majada in", "Majada In");

    return lookup;
}

const BARANGAY_LOOKUP = buildBarangayLookup();

function canonicalizeBarangay(value) {
    const normalized = normalizeCompareText(value);
    if (!normalized) return "";
    return BARANGAY_LOOKUP.get(normalized) || smartTitleCase(value);
}

function getBarangayOfficialLocations() {
    const merged = {};

    Object.keys(PUROKS || {}).forEach(function (barangay) {
        merged[barangay] = Array.isArray(PUROKS[barangay]) ? PUROKS[barangay].slice() : [];
    });

    Object.keys(OFFICIAL_LOCATION_SUPPLEMENTS).forEach(function (barangay) {
        if (!Array.isArray(merged[barangay])) merged[barangay] = [];
        OFFICIAL_LOCATION_SUPPLEMENTS[barangay].forEach(function (location) {
            if (merged[barangay].indexOf(location) === -1) {
                merged[barangay].push(location);
            }
        });
    });

    return merged;
}

const OFFICIAL_LOCATIONS = getBarangayOfficialLocations();

function createOfficialLocationLookup() {
    const lookup = new Map();

    function ensureBarangayMap(barangay) {
        if (!lookup.has(barangay)) lookup.set(barangay, new Map());
        return lookup.get(barangay);
    }

    function addAlias(barangay, canonical, alias) {
        const normalized = normalizeCompareText(alias);
        if (!normalized) return;
        ensureBarangayMap(barangay).set(normalized, canonical);
    }

    Object.keys(OFFICIAL_LOCATIONS).forEach(function (barangay) {
        OFFICIAL_LOCATIONS[barangay].forEach(function (location) {
            const canonical = location === "DoÃ±a Felisa" ? "Dona Felisa" : location;
            addAlias(barangay, canonical, canonical);
            if (/\bsubd\b/i.test(canonical)) {
                addAlias(barangay, canonical, canonical.replace(/\bSubd\.\b/i, "Subdivision"));
                addAlias(barangay, canonical, canonical.replace(/\bSubd\.\b/i, ""));
            }
            if (/\bsubdivision\b/i.test(canonical)) {
                addAlias(barangay, canonical, canonical.replace(/\bSubdivision\b/i, "Subd."));
                addAlias(barangay, canonical, canonical.replace(/\bSubdivision\b/i, ""));
            }
            if (/\bcompound\b/i.test(canonical)) {
                addAlias(barangay, canonical, canonical.replace(/\bCompound\b/i, "Comp."));
            }
            if (/\bsitio\b/i.test(canonical)) {
                addAlias(barangay, canonical, canonical.replace(/^Sitio\s+/i, ""));
            }
        });
    });

    addAlias("Canlubang", "Asia I", "Asia 1");
    addAlias("Canlubang", "Asia II", "Asia 2");
    addAlias("Canlubang", "Ceris III", "Ceris 3");
    addAlias("Canlubang", "Ceris III", "Sitio Ceris 3");
    addAlias("Canlubang", "Palaw", "Palao");
    addAlias("Canlubang", "Palaw", "Sitio Palao");
    addAlias("Canlubang", "Manphil", "Manfil");
    addAlias("Canlubang", "Manphil", "Sitio Manfil");
    addAlias("Canlubang", "Majada-In", "Majada In");
    addAlias("Canlubang", "Mangumit II", "Mangumit 2");
    addAlias("Canlubang", "Mangumit I", "Mangumit 1");
    addAlias("Lecheria", "Barerra", "Barrera");
    addAlias("Lecheria", "Barerra", "Sitio Barrera");
    addAlias("Lecheria", "Barerra", "Sitio Barerra");
    addAlias("Lecheria", "Watawat", "Sitio Watawat");
    addAlias("Paciano Rizal", "Sitio Ilaya", "Ilaya");
    addAlias("Paciano Rizal", "Sitio Maligaya", "Maligaya");
    addAlias("Paciano Rizal", "Sitio Riverside", "Riverside");
    addAlias("Paciano Rizal", "Marivel Subd.", "Marivel");
    addAlias("Paciano Rizal", "Marivel Subd.", "Marivel Subdivision");
    addAlias("Paciano Rizal", "Modern Village", "Modern Village Pacino");
    addAlias("Paciano Rizal", "Dona Felisa", "Doña Felisa");
    addAlias("Paciano Rizal", "Dona Felisa", "Dona Felisa Village");
    addAlias("San Jose", "Jenel Subd.", "Jenel Subdivision");
    addAlias("San Jose", "L.E. Subd.", "L.E. Village");
    addAlias("San Jose", "L.E. Subd.", "LE Village");
    addAlias("Barangay 5 (Poblacion)", "Bandola Subd.", "Bandola");
    addAlias("Barangay 5 (Poblacion)", "Bandola Subd.", "Bandola Subdivision");
    addAlias("Barangay 5 (Poblacion)", "Lazer Comp.", "Lazer Compound");
    addAlias("Barangay 5 (Poblacion)", "Lazer Comp.", "Lacer Compound");
    addAlias("Barangay 5 (Poblacion)", "L.E. II Subdivision", "LE 2");
    addAlias("Barangay 5 (Poblacion)", "L.E. II Subdivision", "LE 2 Compound");
    addAlias("Barangay 6 (Poblacion)", "Sitio Labar", "Labak");
    addAlias("Barangay 6 (Poblacion)", "Sitio Labar", "Sitio Labak");
    addAlias("Barangay 7 (Poblacion)", "Ma. Soledad", "Ma. Soledad Subd.");
    addAlias("Barangay 7 (Poblacion)", "Juliano", "Juliano Subd.");
    addAlias("Barangay 7 (Poblacion)", "Belarmino", "Belarmino Subdivision");
    addAlias("Barangay 7 (Poblacion)", "Borja", "Borja Subdivision");
    addAlias("Barangay 4 (Poblacion)", "Villa Zenaida Subd.", "Villa Zenaida Subdivision");

    return lookup;
}

const OFFICIAL_LOCATION_LOOKUP = createOfficialLocationLookup();

function getBarangayLocationLookup(barangay) {
    return OFFICIAL_LOCATION_LOOKUP.get(barangay) || new Map();
}

function findOfficialLocation(rawValue, barangay) {
    const text = cleanText(rawValue);
    if (!text || !barangay) return "";

    const normalized = normalizeCompareText(text);
    if (!normalized) return "";

    const lookup = getBarangayLocationLookup(barangay);
    if (lookup.has(normalized)) {
        return lookup.get(normalized);
    }

    const entries = Array.from(lookup.entries()).sort(function (left, right) {
        return right[0].length - left[0].length;
    });
    for (const entry of entries) {
        const alias = entry[0];
        if (!alias || alias === normalizeCompareText(barangay)) continue;
        if (normalized.indexOf(` ${alias} `) !== -1) return entry[1];
        if (normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`)) {
            return entry[1];
        }
    }

    return "";
}

function canonicalizePurok(rawValue, barangay, subdivision, contextText) {
    const text = cleanText(rawValue || contextText);
    if (!text) return "";

    const match = text.match(/\bpurok\s*([0-9]+(?:\s*[-/]?\s*[A-Za-z])?|ilaya)\b/i);
    if (!match) return "";

    const suffix = cleanText(match[1]).replace(/\s+/g, "");
    const properSuffix = /ilaya/i.test(suffix) ? "Ilaya" : suffix.toUpperCase();

    if (barangay === "Mayapa" && /^\d/.test(properSuffix)) {
        const subdivisionText = normalizeCompareText(`${subdivision || ""} ${contextText || ""}`);
        if (subdivisionText.indexOf("camp vicente lim") !== -1 || subdivisionText.indexOf("cvl") !== -1) {
            return `EM's Bo. CVL Purok ${properSuffix}`;
        }
        return `Mayapa Proper Purok ${properSuffix}`;
    }

    return `Purok ${properSuffix}`;
}

function canonicalizeSitio(rawValue) {
    const text = cleanText(rawValue);
    if (!text) return "";
    const match = text.match(/\bsitio\s+([A-Za-z0-9][A-Za-z0-9 '.-]*)/i);
    if (!match) return "";
    return smartTitleCase(`Sitio ${match[1]}`);
}

function titleCaseFreeformAddress(value) {
    let result = smartTitleCase(value);
    result = result
        .replace(/\bAlmon\b/gi, "Almond")
        .replace(/\bSanggunay\b/gi, "Sanggumay")
        .replace(/\bSangumay\b/gi, "Sanggumay")
        .replace(/\bManfil\b/gi, "Manphil")
        .replace(/\bPalao\b/gi, "Palaw")
        .replace(/\bLabak\b/gi, "Labar");
    return cleanText(result);
}

function looksLikeBarangayEcho(text, barangay) {
    const normalized = normalizeCompareText(text);
    if (!normalized) return false;
    const barangayNormalized = normalizeCompareText(barangay);
    if (!barangayNormalized) return false;
    return normalized === barangayNormalized
        || normalized === `brgy ${barangayNormalized}`
        || normalized === `barangay ${barangayNormalized}`;
}

function looksLikeOnlyLocationEcho(text) {
    const normalized = normalizeCompareText(text);
    if (!normalized) return false;
    return /^purok\s+[0-9a-z-]+$/.test(normalized)
        || /^sitio\s+[a-z0-9-]+$/.test(normalized)
        || normalized === "brgy"
        || normalized === "barangay";
}

function cleanupSubdivisionText(rawSubdivision, barangay) {
    let subdivision = cleanText(rawSubdivision);
    if (!subdivision) return "";
    if (findOfficialLocation(subdivision, barangay)) return "";

    const normalized = normalizeCompareText(subdivision);
    if (GLOBAL_SUBDIVISION_ALIASES.has(normalized)) {
        subdivision = GLOBAL_SUBDIVISION_ALIASES.get(normalized);
    } else {
        subdivision = smartTitleCase(subdivision);
    }

    if (looksLikeBarangayEcho(subdivision, barangay) || looksLikeOnlyLocationEcho(subdivision)) {
        return "";
    }
    if (
        /\b(?:st\.?|street|rd\.?|road|ave\.?|avenue)\b/i.test(subdivision)
        && !/\b(?:subd|subdivision|village|homes|residences|compound|park|ville|estate|heights|meadows|ridge|view|hills)\b/i.test(subdivision)
    ) {
        return "";
    }

    return cleanText(subdivision);
}

function detectSubdivisionFromAddress(rawAddress, barangay) {
    const text = cleanText(rawAddress);
    if (!text || findOfficialLocation(text, barangay)) return "";

    const normalized = normalizeCompareText(text);
    if (barangay === "Canlubang" && (normalized === "silangan" || normalized === "sitio silangan")) {
        return "Silangan Village";
    }
    if (GLOBAL_SUBDIVISION_ALIASES.has(normalized)) {
        return GLOBAL_SUBDIVISION_ALIASES.get(normalized);
    }

    if (
        /\b(subd|subdivision|village|homes|residences|compound|park|ville|estate|heights|meadows|ridge|view|hills)\b/i.test(text)
        || /^citadel$/i.test(text)
        || /^bria$/i.test(text)
    ) {
        return smartTitleCase(text.replace(/^address\s*:\s*/i, ""));
    }

    return "";
}

function extractBlockLot(text) {
    const raw = cleanText(text);
    if (!raw) return "";

    const blockMatch = raw.match(/\b(?:blk|block)\s*[-.:]?\s*([0-9][0-9A-Za-z]*)\b/i)
        || raw.match(/\bB\s*[-.:]?\s*([0-9][0-9A-Za-z]*)\b/i)
        || raw.match(/\bB([0-9][0-9A-Za-z]*)\b/i);
    const lotMatch = raw.match(/\b(?:lot|lt)\s*[-.:]?\s*([0-9][0-9A-Za-z#]*)\b/i)
        || raw.match(/\bL\s*[-.:]?\s*([0-9][0-9A-Za-z#]*)\b/i)
        || raw.match(/\bL([0-9][0-9A-Za-z#]*)\b/i);
    const phaseMatch = raw.match(/\b(?:phase|ph)\s*[-.:]?\s*([0-9A-Za-z]+)\b/i);
    const unitMatch = raw.match(/\bunit\s*[-.:]?\s*([0-9A-Za-z]+)\b/i);

    const parts = [];
    if (phaseMatch) parts.push(`Phase ${phaseMatch[1].toUpperCase()}`);
    if (blockMatch) parts.push(`Blk ${blockMatch[1].toUpperCase()}`);
    if (lotMatch) parts.push(`Lot ${lotMatch[1].toUpperCase()}`);
    if (unitMatch) parts.push(`Unit ${unitMatch[1].toUpperCase()}`);

    return cleanText(parts.join(" "));
}

function removeKnownLocationNoise(text, barangay, address, subdivision) {
    let result = ` ${cleanText(text)} `;
    if (!result.trim()) return "";

    const phrases = [
        cleanText(address),
        cleanText(subdivision),
        cleanText(barangay),
        `Brgy ${cleanText(barangay)}`,
        `Brgy. ${cleanText(barangay)}`,
        `Barangay ${cleanText(barangay)}`,
        "Calamba City Laguna",
        "Calamba City",
        "Calamba",
        "Laguna"
    ].filter(Boolean);

    phrases.forEach(function (phrase) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ");
    });

    return cleanText(
        result
            .replace(/\b(?:purok|sitio)\s+[a-z0-9-]+\b/ig, " ")
            .replace(/\b(?:brgy|barangay)\b\.?/ig, " ")
            .replace(/[(),]+/g, " ")
    );
}

function extractHashNumber(text, barangay, address, subdivision) {
    const sanitized = removeKnownLocationNoise(text, barangay, address, subdivision);
    if (!sanitized) return "";
    const match = sanitized.match(/#?\s*([0-9]+(?:[A-Za-z0-9/-]*))/);
    if (!match) return "";
    const value = cleanText(match[1])
        .replace(/PUROK.*$/i, "")
        .replace(/SITIO.*$/i, "")
        .replace(/\.0+$/, "");
    return value ? `#${value.toUpperCase()}` : "";
}

function normalizeHouseNo(rawHouseNo, rawAddress, barangay, address, subdivision) {
    return extractBlockLot(rawHouseNo)
        || extractBlockLot(rawAddress)
        || extractHashNumber(rawHouseNo, barangay, address, subdivision)
        || extractHashNumber(rawAddress, barangay, address, subdivision)
        || "";
}

function stripKnownSubdivision(text, subdivision) {
    let result = cleanText(text);
    if (!result || !subdivision) return result;

    [
        subdivision,
        subdivision.replace(/\bHomes\b/i, ""),
        subdivision.replace(/\bResidences\b/i, ""),
        `${subdivision} Homes`,
        `${subdivision} Village`,
        subdivision.replace(/\s+/g, "")
    ]
        .filter(Boolean)
        .forEach(function (phrase) {
            const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            result = result.replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ");
        });

    return cleanText(result);
}

function deriveAddressFromText(rawAddress, rawHouseNo, barangay, subdivision) {
    const directOfficial = findOfficialLocation(rawAddress, barangay);
    if (directOfficial) return directOfficial;

    const directPurok = canonicalizePurok(rawAddress, barangay, subdivision, `${rawAddress} ${rawHouseNo}`);
    if (directPurok) return directPurok;

    const directSitio = canonicalizeSitio(rawAddress);
    if (directSitio) return findOfficialLocation(directSitio, barangay) || directSitio;

    if (!cleanText(rawAddress)) {
        return findOfficialLocation(rawHouseNo, barangay)
            || canonicalizePurok(rawHouseNo, barangay, subdivision, rawHouseNo)
            || canonicalizeSitio(rawHouseNo)
            || "";
    }

    let candidate = cleanText(rawAddress).replace(/^address\s*:\s*/i, "");
    const preserveOrdinalStreet = /^\d+(?:st|nd|rd|th)\s+st(?:reet)?\b/i.test(candidate);
    if (!preserveOrdinalStreet) {
        candidate = candidate.replace(/^[#]?\d+[A-Za-z0-9/-]*\s*/i, "");
    }
    candidate = candidate
        .replace(/\b(?:blk|block|b)\s*[-.:]?\s*[0-9A-Za-z]+\b/ig, " ")
        .replace(/\b(?:lot|lt|l)\s*[-.:]?\s*[0-9A-Za-z#]+\b/ig, " ")
        .replace(/\b(?:phase|ph)\s*[-.:]?\s*[0-9A-Za-z]+\b/ig, " ")
        .replace(/\bunit\s*[-.:]?\s*[0-9A-Za-z]+\b/ig, " ");
    candidate = stripKnownSubdivision(candidate, subdivision);
    candidate = removeKnownLocationNoise(candidate, barangay, "", subdivision);

    if (!candidate || detectSubdivisionFromAddress(candidate, barangay)) return "";
    return titleCaseFreeformAddress(candidate);
}

function normalizeLocationFields(record) {
    const barangay = canonicalizeBarangay(record.barangay);
    const rawAddress = cleanText(record.address);
    const rawSubdivision = cleanText(record.subdivisionVillageCompound);
    const rawHouseNo = cleanText(record.houseNo);

    let subdivision = cleanupSubdivisionText(rawSubdivision, barangay);
    let address = deriveAddressFromText(rawAddress, rawHouseNo, barangay, subdivision);

    const officialFromSubdivision = findOfficialLocation(rawSubdivision, barangay);
    if (officialFromSubdivision && (!address || /^Purok /i.test(address) || /^Barangay /i.test(address))) {
        address = officialFromSubdivision;
        subdivision = "";
    } else if (officialFromSubdivision && normalizeCompareText(address) === normalizeCompareText(officialFromSubdivision)) {
        subdivision = "";
    } else if (officialFromSubdivision) {
        subdivision = smartTitleCase(rawSubdivision);
    } else if (!subdivision) {
        subdivision = cleanupSubdivisionText(detectSubdivisionFromAddress(rawAddress, barangay), barangay);
    }

    if (subdivision && /^(?:P\d+|[A-Z])$/i.test(address)) {
        address = "";
    }
    if (
        barangay !== "Canlubang"
        && !rawAddress
        && normalizeCompareText(rawSubdivision) === "silangan village"
        && normalizeCompareText(subdivision) === "silangan village"
        && !address
    ) {
        address = "Silangan";
        subdivision = "";
    }
    if (address) {
        const normalizedAddress = normalizeCompareText(address);
        if (!normalizedAddress || (normalizedAddress.length <= 2 && normalizedAddress !== "mcdc")) {
            address = "";
        }
    }

    return {
        houseNo: normalizeHouseNo(rawHouseNo, rawAddress, barangay, address, subdivision),
        address: cleanText(address),
        subdivisionVillageCompound: subdivision,
        barangay: barangay
    };
}

function buildDisplayName(record) {
    const lastName = cleanText(record.lastName);
    const firstName = cleanText(record.firstName);
    const middleName = cleanText(record.middleName);
    if (lastName) {
        return cleanText(`${lastName}${firstName ? `, ${firstName}` : ""}${middleName ? ` ${middleName}` : ""}`);
    }
    return cleanText(`${firstName}${middleName ? ` ${middleName}` : ""}`) || cleanText(record.name);
}

function normalizeLeader(value) {
    return smartTitleCase(value);
}

function normalizeRecord(record) {
    const next = JSON.parse(JSON.stringify(record || {}));
    next.lastName = titleCasePerson(next.lastName);
    next.firstName = titleCasePerson(next.firstName);
    next.middleName = titleCasePerson(next.middleName);
    next.name = buildDisplayName(next);
    next.leaderBarangayOfficial = normalizeLeader(next.leaderBarangayOfficial);
    next.organization_name = smartTitleCase(next.organization_name);

    const normalizedLocations = normalizeLocationFields(next);
    next.houseNo = normalizedLocations.houseNo;
    next.address = normalizedLocations.address;
    next.subdivisionVillageCompound = normalizedLocations.subdivisionVillageCompound;
    next.barangay = normalizedLocations.barangay;

    if (Array.isArray(next.history)) {
        next.history = next.history.map(function (entry) {
            const historyEntry = Object.assign({}, entry || {});
            historyEntry.name = next.name;
            historyEntry.leader = normalizeLeader(historyEntry.leader);
            return historyEntry;
        });
    }

    return next;
}

function normalizeImportRow(row) {
    const next = Object.assign({}, row || {});
    next.record = normalizeRecord(next.record);

    if (next.historyEntry && typeof next.historyEntry === "object") {
        next.historyEntry = Object.assign({}, next.historyEntry, {
            name: next.record.name,
            leader: normalizeLeader(next.historyEntry.leader)
        });
    }

    return next;
}

function parseImportRows(filePath) {
    const original = fs.readFileSync(filePath, "utf8");
    const match = original.match(/^([\s\S]*?\$lbu_import_json\$)\s*([\s\S]*?)\s*(\$lbu_import_json\$[\s\S]*)$/);
    if (!match) {
        throw new Error(`JSON payload block not found in ${filePath}`);
    }

    return {
        before: match[1],
        rows: JSON.parse(match[2]),
        after: match[3],
        lineEnding: original.indexOf("\r\n") !== -1 ? "\r\n" : "\n"
    };
}

function writeImportRows(filePath, before, rows, after, lineEnding) {
    const jsonText = JSON.stringify(rows, null, 2).replace(/\n/g, lineEnding);
    fs.writeFileSync(filePath, `${before}${lineEnding}${jsonText}${lineEnding}${after}`, "utf8");
}

function summarizeDiff(originalRows, nextRows) {
    let changedRows = 0;
    for (let index = 0; index < originalRows.length; index += 1) {
        if (JSON.stringify(originalRows[index]) !== JSON.stringify(nextRows[index])) {
            changedRows += 1;
        }
    }
    return {
        totalRows: originalRows.length,
        changedRows: changedRows
    };
}

function main() {
    const summary = [];

    PART_NUMBERS.forEach(function (partNumber) {
        const fileName = `lbu-client-import-part-${String(partNumber).padStart(2, "0")}.sql`;
        const filePath = path.resolve(PARTS_DIR, fileName);
        const parsed = parseImportRows(filePath);
        const nextRows = parsed.rows.map(normalizeImportRow);
        const diff = summarizeDiff(parsed.rows, nextRows);

        summary.push({
            fileName: fileName,
            totalRows: diff.totalRows,
            changedRows: diff.changedRows
        });

        if (SHOULD_WRITE) {
            writeImportRows(filePath, parsed.before, nextRows, parsed.after, parsed.lineEnding);
        }
    });

    console.log(JSON.stringify({
        mode: SHOULD_WRITE ? "write" : "dry-run",
        summary: summary
    }, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    normalizeImportRow: normalizeImportRow,
    parseImportRows: parseImportRows,
    normalizeLocationFields: normalizeLocationFields,
    canonicalizeBarangay: canonicalizeBarangay
};
