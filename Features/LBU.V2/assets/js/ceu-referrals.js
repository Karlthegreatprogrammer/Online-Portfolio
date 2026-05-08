/* Shared CEU referral helper.
   Loads active CEU records from Supabase and matches client referral entries to them. */
(function () {
    "use strict";

    const REFERRAL_CATEGORIES = ["officials", "sk-officials", "sectoral-orgs"];
    const CATEGORY_LABELS = {
        officials: "BARANGAY OFFICIALS",
        "sk-officials": "SK OFFICIALS",
        "sectoral-orgs": "SECTORAL ORGS"
    };
    const CHANGE_EVENT = "lb:ceu-referrals-changed";
    const REFRESH_DEBOUNCE_MS = 400;

    const state = {
        error: null,
        ready: false,
        loadingPromise: null,
        items: [],
        itemsByRecordKey: {},
        countsByRecordKey: {},
        loadedAt: ""
    };

    let refreshTimer = 0;
    const attachedInputs = [];
    const pickerState = {
        activeInput: null,
        activeOptions: {},
        query: "",
        category: "",
        selectedKey: "",
        page: 1,
        pageSize: 25,
        refs: null,
        previousFocus: null
    };

    function safeClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return value;
        }
    }

    function cleanText(value) {
        return String(value || "")
            .replace(/[\u2013\u2014]/g, "-")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeBarangayLabel(value) {
        const text = cleanText(value);
        const uppercase = text.toUpperCase();

        if (uppercase.startsWith("BA") && uppercase.includes("ADERO")) {
            return "BA\u00D1ADERO";
        }

        return text;
    }

    function isReferralCategory(category) {
        return REFERRAL_CATEGORIES.indexOf(String(category || "")) !== -1;
    }

    function getCategoryLabel(category) {
        return CATEGORY_LABELS[String(category || "")] || String(category || "");
    }

    function isBlankReferralValue(value) {
        const text = cleanText(value).toLowerCase();
        if (!text) return true;
        return /^(n\/?a|none|null|no|wala|blank|-|--|\.)$/.test(text);
    }

    function normalizeReferralName(value) {
        if (isBlankReferralValue(value)) return "";
        return cleanText(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\b(hon|honorable|mr|mrs|ms|miss|kap|kapt|capt|captain|kag|kagawad|chair|chairman|chairwoman)\.?\b/g, " ")
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeSearchText(value) {
        return cleanText(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    function titleWord(word, index) {
        const source = String(word || "");
        if (!source) return "";
        if (!/[A-Za-z]/.test(source)) return source;

        const lower = source.toLocaleLowerCase("en-PH");
        const suffixMatch = lower.match(/^(jr|sr)(\.?)$/);
        if (suffixMatch) return suffixMatch[1].toUpperCase() + (suffixMatch[2] || ".");
        if (/^(ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(lower)) return lower.toUpperCase();
        if (/^[a-z]\.?$/.test(lower)) return lower.charAt(0).toUpperCase() + (lower.endsWith(".") ? "." : "");

        return lower.split(/([-'])/).map(function (part) {
            if (part === "-" || part === "'") return part;
            return part ? part.charAt(0).toLocaleUpperCase("en-PH") + part.slice(1) : "";
        }).join("");
    }

    function toTitleCaseName(value) {
        const text = cleanText(value);
        if (!text) return "";

        return text.split(/\s+/).map(function (word, index) {
            return titleWord(word, index);
        }).join(" ");
    }

    function formatCommaName(value) {
        const text = cleanText(value);
        if (!text) return "";
        return text.split(",").map(function (part) {
            return toTitleCaseName(part);
        }).filter(Boolean).join(", ");
    }

    function formatNameValue(value) {
        const text = cleanText(value);
        if (!text) return "";
        return text.indexOf(",") !== -1 ? formatCommaName(text) : toTitleCaseName(text);
    }

    function buildFullNameFromParts(record) {
        return [record && record.firstName, record && record.middleName, record && record.lastName]
            .map(cleanText)
            .filter(Boolean)
            .join(" ");
    }

    function buildDisplayNameFromParts(record) {
        const lastName = cleanText(record && record.lastName);
        const firstName = cleanText(record && record.firstName);
        const middleName = cleanText(record && record.middleName);
        return [lastName, firstName, middleName].filter(Boolean).join(", ");
    }

    function displayNameToFullName(value) {
        const parts = cleanText(value).split(",").map(cleanText).filter(Boolean);
        if (parts.length < 2) return "";
        return [parts[1], parts[2], parts[0]].filter(Boolean).join(" ");
    }

    function getReferralDisplayName(record) {
        const source = record || {};
        const fullFromParts = buildFullNameFromParts(source);
        const candidate = cleanText(fullFromParts || source.fullName || source.representative || displayNameToFullName(source.displayName) || source.displayName || source.organization);
        return formatNameValue(candidate);
    }

    function formatRecordForDisplay(record) {
        const source = record && typeof record === "object" ? record : {};
        const next = Object.assign({}, source);
        ["lastName", "firstName", "middleName", "fullName", "representative"].forEach(function (key) {
            if (next[key] != null) next[key] = toTitleCaseName(next[key]);
        });
        if (next.displayName != null) next.displayName = formatCommaName(next.displayName);
        if (next.barangay != null) next.barangay = normalizeBarangayLabel(next.barangay);
        return next;
    }

    function addAlias(aliases, value) {
        const text = cleanText(value);
        if (!text || isBlankReferralValue(text)) return;
        aliases.add(text);
        aliases.add(formatNameValue(text));
        const normalized = normalizeReferralName(text);
        if (normalized) aliases.add(normalized);
    }

    function getRecordAliases(record) {
        const source = record || {};
        const aliases = new Set();
        const fullFromParts = buildFullNameFromParts(source);
        const displayFromParts = buildDisplayNameFromParts(source);
        const displayAsFull = displayNameToFullName(source.displayName);

        [
            fullFromParts,
            displayFromParts,
            source.fullName,
            source.displayName,
            displayAsFull,
            source.representative,
            source.organization
        ].forEach(function (value) {
            addAlias(aliases, value);
        });

        return Array.from(aliases)
            .map(normalizeReferralName)
            .filter(Boolean);
    }

    function getRecordKey(category, record) {
        const source = record || {};
        const sourceCategory = String(category || source.sourceCategory || source.category || "").trim();
        const id = cleanText(source.id || source.source_id || source.sourceId);
        if (sourceCategory && id) {
            return sourceCategory + "::" + id;
        }
        return sourceCategory + "::" + (normalizeReferralName(getReferralDisplayName(source)) || Math.random().toString(36).slice(2));
    }

    function getRecordRole(record) {
        return cleanText(record && (record.position || record.role || record.sector || record.organization));
    }

    function getRecordPlace(record) {
        return [
            record && record.houseStreet,
            record && record.houseNumber,
            record && record.purokSitioVillage,
            record && record.purokSitioSubd,
            record && record.organizationPurok,
            record && record.officeAddress,
            record && record.place
        ].map(cleanText).filter(Boolean).join(" | ");
    }

    function getItemSearchIndex(item) {
        const record = item && item.record && typeof item.record === "object" ? item.record : {};
        return normalizeSearchText([
            item && item.displayName,
            item && item.categoryLabel,
            item && item.category,
            item && item.barangay,
            item && item.role,
            record.fullName,
            record.displayName,
            record.representative,
            record.organization,
            record.position,
            record.sector,
            record.houseStreet,
            record.houseNumber,
            record.purokSitioVillage,
            record.purokSitioSubd,
            record.organizationPurok,
            record.officeAddress,
            record.contactNumber,
            record.emailAddress,
            record.birthdate,
            record.searchIndex,
            record.place
        ].filter(Boolean).join(" "));
    }

    function getConfig() {
        const config = window.LBU_SUPABASE_CONFIG || {};
        return {
            ceuRecordsTable: config.ceuRecordsTable || "ceu_records"
        };
    }

    function canLoadCloud() {
        return !!(
            window.lbSupabase &&
            window.lbSupabase.isEnabled &&
            window.lbSupabase.isEnabled() &&
            window.lbAuth &&
            window.lbAuth.isAuthenticated &&
            window.lbAuth.isAuthenticated()
        );
    }

    async function loadCeuRowsFromCloud() {
        if (!canLoadCloud()) return [];

        const client = await window.lbSupabase.getClient();
        const table = getConfig().ceuRecordsTable;
        const rows = [];
        const pageSize = 1000;

        for (let from = 0; ; from += pageSize) {
            const response = await client
                .from(table)
                .select("category, source_id, record, is_deleted, updated_at")
                .in("category", REFERRAL_CATEGORIES)
                .order("category", { ascending: true })
                .order("source_id", { ascending: true })
                .range(from, from + pageSize - 1);

            if (response.error) throw response.error;

            const pageRows = Array.isArray(response.data) ? response.data : [];
            rows.push.apply(rows, pageRows);
            if (pageRows.length < pageSize) break;
        }

        return rows.filter(function (row) {
            return row && !row.is_deleted && isReferralCategory(row.category);
        }).map(function (row) {
            const record = row.record && typeof row.record === "object" ? safeClone(row.record) : {};
            record.id = cleanText(record.id || row.source_id);
            return {
                category: row.category,
                record: record
            };
        });
    }

    async function loadClientRecords() {
        if (window.lbData && typeof window.lbData.initialize === "function") {
            await window.lbData.initialize();
            return typeof window.lbData.getRecords === "function" ? window.lbData.getRecords() : [];
        }

        if (window.lbSupabase && window.lbSupabase.isEnabled && window.lbSupabase.isEnabled()) {
            return [];
        }

        try {
            const parsed = JSON.parse(localStorage.getItem("records") || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function getReferralValuesFromClientRecord(record) {
        const values = [];
        const history = Array.isArray(record && record.history) ? record.history : [];

        if (history.length) {
            history.forEach(function (entry) {
                const value = cleanText(entry && (entry.leader || entry.leaderBarangayOfficial));
                if (!isBlankReferralValue(value)) values.push(value);
            });
            return values;
        }

        const value = cleanText(record && record.leaderBarangayOfficial);
        if (!isBlankReferralValue(value)) values.push(value);
        return values;
    }

    function buildItems(ceuRows, clientRecords) {
        const itemsByRecordKey = {};
        const countsByRecordKey = {};
        const aliasToRecordKeys = new Map();

        const items = (Array.isArray(ceuRows) ? ceuRows : []).map(function (row) {
            const category = row.category;
            const displayRecord = formatRecordForDisplay(row.record);
            const key = getRecordKey(category, displayRecord);
            const aliases = getRecordAliases(displayRecord);
            const item = {
                key: key,
                category: category,
                categoryLabel: getCategoryLabel(category),
                record: displayRecord,
                displayName: getReferralDisplayName(displayRecord),
                barangay: normalizeBarangayLabel(displayRecord.barangay),
                role: getRecordRole(displayRecord),
                aliases: aliases,
                count: 0
            };

            itemsByRecordKey[key] = item;
            countsByRecordKey[key] = 0;
            aliases.forEach(function (alias) {
                if (!aliasToRecordKeys.has(alias)) {
                    aliasToRecordKeys.set(alias, new Set());
                }
                aliasToRecordKeys.get(alias).add(key);
            });
            return item;
        }).filter(function (item) {
            return !!item.displayName;
        });

        (Array.isArray(clientRecords) ? clientRecords : []).forEach(function (record) {
            getReferralValuesFromClientRecord(record).forEach(function (value) {
                const normalized = normalizeReferralName(value);
                const matchedKeys = normalized ? aliasToRecordKeys.get(normalized) : null;
                if (!matchedKeys) return;
                matchedKeys.forEach(function (key) {
                    countsByRecordKey[key] = (countsByRecordKey[key] || 0) + 1;
                });
            });
        });

        items.forEach(function (item) {
            item.count = countsByRecordKey[item.key] || 0;
        });

        items.sort(function (first, second) {
            return first.displayName.localeCompare(second.displayName, undefined, { sensitivity: "base" });
        });

        return {
            items: items,
            itemsByRecordKey: itemsByRecordKey,
            countsByRecordKey: countsByRecordKey
        };
    }

    function dispatchChange() {
        refreshAttachedInputs();
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
            detail: {
                ready: state.ready,
                error: state.error,
                items: getReferrers(),
                loadedAt: state.loadedAt
            }
        }));
    }

    async function initialize(options) {
        const opts = options || {};
        if (state.loadingPromise && !opts.force) {
            return state.loadingPromise;
        }

        state.loadingPromise = Promise.all([
            loadCeuRowsFromCloud(),
            loadClientRecords()
        ]).then(function (result) {
            const built = buildItems(result[0], result[1]);
            state.items = built.items;
            state.itemsByRecordKey = built.itemsByRecordKey;
            state.countsByRecordKey = built.countsByRecordKey;
            state.ready = true;
            state.error = null;
            state.loadedAt = new Date().toISOString();
            return getReferrers();
        }).catch(function (error) {
            state.error = error;
            state.ready = false;
            state.items = [];
            state.itemsByRecordKey = {};
            state.countsByRecordKey = {};
            throw error;
        }).finally(function () {
            state.loadingPromise = null;
            dispatchChange();
        });

        return state.loadingPromise;
    }

    function refresh() {
        return initialize({ force: true });
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(function () {
            refresh().catch(function (err) {
                console.warn("Failed to refresh CEU referrals.", err);
            });
        }, REFRESH_DEBOUNCE_MS);
    }

    function getReferrers() {
        return safeClone(state.items || []);
    }

    function getSummaryItems() {
        return getReferrers().sort(function (first, second) {
            const countDiff = Number(second.count || 0) - Number(first.count || 0);
            if (countDiff !== 0) return countDiff;
            return String(first.displayName || "").localeCompare(String(second.displayName || ""), undefined, { sensitivity: "base" });
        });
    }

    function getRecordCount(category, record) {
        const sourceCategory = String(category || record && record.sourceCategory || "").trim();
        const key = getRecordKey(sourceCategory, record);
        if (Object.prototype.hasOwnProperty.call(state.countsByRecordKey, key)) {
            return state.countsByRecordKey[key] || 0;
        }

        const aliases = getRecordAliases(record);
        const item = (state.items || []).find(function (candidate) {
            if (candidate.category !== sourceCategory) return false;
            return aliases.some(function (alias) {
                return candidate.aliases.indexOf(alias) !== -1;
            });
        });
        return item ? Number(item.count || 0) : 0;
    }

    function interpolateColor(first, second, amount) {
        const t = Math.max(0, Math.min(Number(amount) || 0, 1));
        return first.map(function (value, index) {
            return Math.round(value + (second[index] - value) * t);
        });
    }

    function rgbText(rgb) {
        return "rgb(" + rgb.join(", ") + ")";
    }

    function getHeatColor(count) {
        const numeric = Number(count) || 0;
        if (numeric <= 0) return "#ffffff";

        const value = Math.max(1, Math.min(numeric, 100));
        const normalized = (value - 1) / 99;
        const palette = [
            [75, 0, 130],    // indigo
            [47, 111, 211],  // blue
            [48, 183, 126],  // green
            [255, 222, 112], // yellow
            [247, 144, 64],  // orange
            [193, 43, 31]    // red
        ];
        const segments = palette.length - 1;
        const scaled = normalized * segments;
        const index = Math.min(segments - 1, Math.floor(scaled));
        const amount = scaled - index;
        return rgbText(interpolateColor(palette[index], palette[index + 1], amount));
    }

    function getHeatTextColor(count) {
        const value = Math.max(0, Math.min(Number(count) || 0, 100));
        if (value <= 0) return "#16253a";
        return value <= 22 || value >= 85 ? "#ffffff" : "#16253a";
    }

    function getHeatStyle(count) {
        return {
            backgroundColor: getHeatColor(count),
            color: getHeatTextColor(count)
        };
    }

    function populateDatalist(datalistEl) {
        if (!datalistEl) return;
        datalistEl.innerHTML = "";
        getReferrers().forEach(function (item) {
            const option = document.createElement("option");
            option.value = item.displayName;
            option.label = [item.categoryLabel, item.barangay, item.role].filter(Boolean).join(" | ");
            datalistEl.appendChild(option);
        });
    }

    function refreshAttachedInputs() {
        attachedInputs.forEach(function (entry) {
            if (entry.datalist) {
                populateDatalist(entry.datalist);
            }
        });
        if (pickerState.refs && !pickerState.refs.modal.hidden) {
            renderPickerResults();
        }
    }

    function dispatchFieldChanged(input) {
        if (!input) return;
        input.classList.toggle("filled", cleanText(input.value) !== "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function ensurePickerStyles() {
        if (document.getElementById("lbCeuReferralPickerStyles")) return;
        const style = document.createElement("style");
        style.id = "lbCeuReferralPickerStyles";
        style.textContent = [
            ".lb-referral-picker[hidden]{display:none!important}",
            ".lb-referral-picker{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px}",
            ".lb-referral-picker__backdrop{position:absolute;inset:0;background:rgba(12,27,48,.58);backdrop-filter:blur(4px)}",
            ".lb-referral-picker__dialog{position:relative;width:min(980px,100%);max-height:min(780px,92vh);display:grid;grid-template-rows:auto auto auto minmax(220px,1fr) auto;overflow:hidden;border:1px solid rgba(190,207,226,.9);border-radius:8px;background:#f6f9fc;color:#16253a;box-shadow:0 24px 70px rgba(4,20,44,.32)}",
            ".lb-referral-picker__header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid #dbe7f3;background:#fff}",
            ".lb-referral-picker__eyebrow{display:block;color:#0f6ccf;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}",
            ".lb-referral-picker__title{margin-top:4px;font-size:1.24rem;font-weight:900;color:#16253a}",
            ".lb-referral-picker__copy{margin:5px 0 0;color:#536a83;font-size:.86rem;line-height:1.45;max-width:640px}",
            ".lb-referral-picker__close{border:1px solid #b8cce1;background:#fff;color:#16456f;border-radius:8px;min-width:38px;min-height:34px;font-size:1.2rem;cursor:pointer}",
            ".lb-referral-picker__controls{display:grid;grid-template-columns:minmax(260px,1fr) minmax(190px,230px);gap:12px;padding:16px 20px;background:#f6f9fc;border-bottom:1px solid #dbe7f3}",
            ".lb-referral-picker__controls input,.lb-referral-picker__controls select{width:100%;min-height:44px;border:1px solid #cbd9e8;border-radius:8px;background:#fff;color:#16253a;padding:10px 12px;font-size:.92rem;font-weight:700}",
            ".lb-referral-picker__controls input:focus,.lb-referral-picker__controls select:focus{outline:none;border-color:#0f6ccf;box-shadow:0 0 0 3px rgba(15,108,207,.16)}",
            ".lb-referral-picker__status{padding:12px 20px;color:#536a83;font-size:.84rem;font-weight:800;background:#fff;border-bottom:1px solid #e4edf7}",
            ".lb-referral-picker__results{overflow:auto;padding:14px 20px 18px;display:grid;gap:10px;align-content:start}",
            ".lb-referral-picker__row{width:100%;border:1px solid #dbe7f3;border-left:4px solid #b8d4f0;border-radius:8px;background:#fff;text-align:left;padding:13px 14px;cursor:pointer;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:start;color:#16253a}",
            ".lb-referral-picker__row:hover{border-color:#88b8e8;border-left-color:#0f6ccf;background:#fbfdff}",
            ".lb-referral-picker__row.is-selected{border-color:#0f6ccf;border-left-color:#0f6ccf;box-shadow:0 0 0 3px rgba(15,108,207,.15);background:#eef6ff}",
            ".lb-referral-picker__mark{width:18px;height:18px;border:2px solid #9cb9d8;border-radius:50%;margin-top:2px;background:#fff;box-shadow:inset 0 0 0 4px #fff}",
            ".lb-referral-picker__row.is-selected .lb-referral-picker__mark{border-color:#0f6ccf;background:#0f6ccf}",
            ".lb-referral-picker__name{display:block;font-weight:900;font-size:1rem;line-height:1.3;color:#16253a}",
            ".lb-referral-picker__meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;color:#536a83;font-size:.78rem;font-weight:700}",
            ".lb-referral-picker__chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid #dbe7f3;border-radius:999px;background:#f7fbff;padding:4px 8px}",
            ".lb-referral-picker__chip-label{color:#6b7f95;font-size:.68rem;font-weight:900;letter-spacing:.03em;text-transform:uppercase}",
            ".lb-referral-picker__chip-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
            ".lb-referral-picker__tag{display:inline-flex;align-items:center;border-radius:999px;background:#eaf3fd;color:#0f4f91;padding:5px 9px;font-size:.72rem;font-weight:900;white-space:nowrap}",
            ".lb-referral-picker__empty{border:1px dashed #cbd9e8;border-radius:8px;background:#fff;padding:24px;color:#536a83;font-weight:800;text-align:center}",
            ".lb-referral-picker__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid #dbe7f3;background:#fff;padding:14px 20px}",
            ".lb-referral-picker__selected{color:#536a83;font-size:.84rem;font-weight:800;min-width:220px;flex:1}",
            ".lb-referral-picker__actions{display:flex;gap:10px;flex-wrap:wrap}",
            ".lb-referral-picker__btn{border:1px solid #9ec3eb;background:#fff;color:#0f4f91;border-radius:8px;min-height:36px;padding:8px 12px;font-size:.84rem;font-weight:800;cursor:pointer}",
            ".lb-referral-picker__btn--primary{background:#0f6ccf;color:#fff;border-color:#0f6ccf}",
            ".lb-referral-picker__btn:disabled{opacity:.55;cursor:not-allowed}",
            ".lb-referral-picker-input{cursor:pointer!important;background:#fff!important;background-image:linear-gradient(90deg,transparent,transparent)!important}",
            ".lb-referral-picker-input[readonly]{caret-color:transparent}",
            "@media (max-width:720px){.lb-referral-picker{padding:10px}.lb-referral-picker__dialog{max-height:94vh}.lb-referral-picker__controls{grid-template-columns:1fr}.lb-referral-picker__row{grid-template-columns:auto minmax(0,1fr)}.lb-referral-picker__tag{grid-column:2}.lb-referral-picker__footer{align-items:stretch}.lb-referral-picker__actions{width:100%}.lb-referral-picker__btn{flex:1}}"
        ].join("\n");
        document.head.appendChild(style);
    }

    function ensurePickerModal() {
        ensurePickerStyles();
        if (pickerState.refs) return pickerState.refs;

        const modal = document.createElement("div");
        modal.className = "lb-referral-picker";
        modal.hidden = true;
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "lbReferralPickerTitle");
        modal.innerHTML =
            '<div class="lb-referral-picker__backdrop" data-referral-picker-close></div>' +
            '<div class="lb-referral-picker__dialog">' +
                '<div class="lb-referral-picker__header">' +
                    '<div>' +
                        '<span class="lb-referral-picker__eyebrow">Current CEU Records</span>' +
                        '<div class="lb-referral-picker__title" id="lbReferralPickerTitle">VIP/Leaders Referral</div>' +
                        '<p class="lb-referral-picker__copy">Type a name, barangay, purok, birthday, contact, role, or organization. Select one current CEU record, then confirm.</p>' +
                    '</div>' +
                    '<button class="lb-referral-picker__close" type="button" aria-label="Close referral picker" data-referral-picker-close>&times;</button>' +
                '</div>' +
                '<div class="lb-referral-picker__controls">' +
                    '<input type="search" data-referral-picker-search placeholder="Search name, barangay, purok, birthday, contact, role, or organization">' +
                    '<select data-referral-picker-category aria-label="Filter by CEU category">' +
                        '<option value="">All referral categories</option>' +
                        '<option value="officials">BARANGAY OFFICIALS</option>' +
                        '<option value="sk-officials">SK OFFICIALS</option>' +
                        '<option value="sectoral-orgs">SECTORAL ORGS</option>' +
                    '</select>' +
                '</div>' +
                '<div class="lb-referral-picker__status" data-referral-picker-status>Loading current CEU referral names...</div>' +
                '<div class="lb-referral-picker__results" data-referral-picker-results></div>' +
                '<div class="lb-referral-picker__footer">' +
                    '<div class="lb-referral-picker__selected" data-referral-picker-selected>No name selected.</div>' +
                    '<div class="lb-referral-picker__actions">' +
                        '<button class="lb-referral-picker__btn" type="button" data-referral-picker-clear>No Referral</button>' +
                        '<button class="lb-referral-picker__btn" type="button" data-referral-picker-prev>Previous</button>' +
                        '<button class="lb-referral-picker__btn" type="button" data-referral-picker-next>Next</button>' +
                        '<button class="lb-referral-picker__btn lb-referral-picker__btn--primary" type="button" data-referral-picker-confirm disabled>Confirm</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        const refs = {
            modal: modal,
            search: modal.querySelector("[data-referral-picker-search]"),
            category: modal.querySelector("[data-referral-picker-category]"),
            status: modal.querySelector("[data-referral-picker-status]"),
            results: modal.querySelector("[data-referral-picker-results]"),
            selected: modal.querySelector("[data-referral-picker-selected]"),
            confirm: modal.querySelector("[data-referral-picker-confirm]"),
            clear: modal.querySelector("[data-referral-picker-clear]"),
            prev: modal.querySelector("[data-referral-picker-prev]"),
            next: modal.querySelector("[data-referral-picker-next]")
        };

        modal.querySelectorAll("[data-referral-picker-close]").forEach(function (button) {
            button.addEventListener("click", closePicker);
        });
        refs.search.addEventListener("input", function () {
            pickerState.query = refs.search.value || "";
            pickerState.page = 1;
            renderPickerResults();
        });
        refs.category.addEventListener("change", function () {
            pickerState.category = refs.category.value || "";
            pickerState.page = 1;
            renderPickerResults();
        });
        refs.confirm.addEventListener("click", confirmPickerSelection);
        refs.clear.addEventListener("click", clearPickerSelection);
        refs.prev.addEventListener("click", function () {
            pickerState.page = Math.max(1, pickerState.page - 1);
            renderPickerResults();
        });
        refs.next.addEventListener("click", function () {
            pickerState.page += 1;
            renderPickerResults();
        });

        pickerState.refs = refs;
        return refs;
    }

    function getPickerItems() {
        const query = normalizeSearchText(pickerState.query);
        const category = cleanText(pickerState.category);
        return getReferrers().filter(function (item) {
            if (category && item.category !== category) return false;
            if (query && getItemSearchIndex(item).indexOf(query) === -1) return false;
            return true;
        });
    }

    function findItemByInputValue(value) {
        const normalized = normalizeReferralName(value);
        if (!normalized) return null;
        return (state.items || []).find(function (item) {
            return item.aliases && item.aliases.indexOf(normalized) !== -1;
        }) || null;
    }

    function renderPickerResults() {
        const refs = ensurePickerModal();
        const items = getPickerItems();
        const pageSize = pickerState.pageSize;
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        pickerState.page = Math.min(Math.max(1, Number(pickerState.page) || 1), totalPages);
        const start = (pickerState.page - 1) * pageSize;
        const pageItems = items.slice(start, start + pageSize);
        const selectedItem = (state.items || []).find(function (item) {
            return item.key === pickerState.selectedKey;
        });

        refs.search.value = pickerState.query;
        refs.category.value = pickerState.category;
        refs.confirm.disabled = !selectedItem;
        refs.prev.disabled = !items.length || pickerState.page <= 1;
        refs.next.disabled = !items.length || pickerState.page >= totalPages;
        refs.selected.textContent = selectedItem
            ? "Selected: " + selectedItem.displayName + " - " + [selectedItem.categoryLabel, selectedItem.barangay].filter(Boolean).join(" | ")
            : "No name selected.";

        if (!state.ready && state.loadingPromise) {
            refs.status.textContent = "Loading current CEU referral names...";
            refs.results.innerHTML = '<div class="lb-referral-picker__empty">Loading current CEU records...</div>';
            return;
        }

        if (!state.ready && state.error) {
            refs.status.textContent = "CEU referral names are unavailable. Check Supabase connection and admin session.";
            refs.results.innerHTML = '<div class="lb-referral-picker__empty">Unable to load referral names right now.</div>';
            return;
        }

        refs.status.textContent = items.length
            ? "Showing " + (start + 1).toLocaleString() + "-" + (start + pageItems.length).toLocaleString() + " of " + items.length.toLocaleString() + " current CEU referral name(s)."
            : "No matching current CEU referral names.";

        if (!items.length) {
            refs.results.innerHTML = '<div class="lb-referral-picker__empty">No matching name found. Try name, barangay, purok, birthday, contact, role, or organization.</div>';
            return;
        }

        function renderChip(label, value) {
            const text = cleanText(value);
            if (!text) return "";
            return '<span class="lb-referral-picker__chip">' +
                '<span class="lb-referral-picker__chip-label">' + escapeHtml(label) + '</span>' +
                '<span class="lb-referral-picker__chip-value">' + escapeHtml(text) + '</span>' +
            '</span>';
        }

        refs.results.innerHTML = pageItems.map(function (item) {
            const record = item.record || {};
            const place = getRecordPlace(record);
            const count = Number(item.count || 0);
            return '<button class="lb-referral-picker__row' + (item.key === pickerState.selectedKey ? ' is-selected' : '') + '" type="button" data-referral-key="' + escapeHtml(item.key) + '">' +
                '<span class="lb-referral-picker__mark" aria-hidden="true"></span>' +
                '<span>' +
                    '<span class="lb-referral-picker__name">' + escapeHtml(item.displayName || '') + '</span>' +
                    '<span class="lb-referral-picker__meta">' +
                        renderChip('Category', item.categoryLabel) +
                        renderChip('Barangay', item.barangay) +
                        renderChip('Role', item.role) +
                        renderChip('Place', place) +
                        renderChip('Birthday', record.birthdate) +
                        renderChip('Contact', record.contactNumber) +
                    '</span>' +
                '</span>' +
                '<span class="lb-referral-picker__tag">' + escapeHtml(count.toLocaleString()) + ' referral' + (count === 1 ? '' : 's') + '</span>' +
            '</button>';
        }).join("");

        refs.results.querySelectorAll("[data-referral-key]").forEach(function (button) {
            button.addEventListener("click", function () {
                pickerState.selectedKey = button.getAttribute("data-referral-key") || "";
                renderPickerResults();
            });
            button.addEventListener("dblclick", function () {
                pickerState.selectedKey = button.getAttribute("data-referral-key") || "";
                confirmPickerSelection();
            });
        });
    }

    function openPicker(input, options) {
        if (!input) return;
        const refs = ensurePickerModal();
        pickerState.activeInput = input;
        pickerState.activeOptions = options || {};
        pickerState.previousFocus = document.activeElement;
        pickerState.query = "";
        pickerState.category = "";
        pickerState.page = 1;
        const existingItem = findItemByInputValue(input.value);
        pickerState.selectedKey = existingItem ? existingItem.key : "";
        refs.modal.hidden = false;
        document.body.classList.add("lb-referral-picker-open");
        const loadingPromise = (state.ready ? Promise.resolve(getReferrers()) : initialize()).then(function () {
            const currentItem = findItemByInputValue(input.value);
            pickerState.selectedKey = currentItem ? currentItem.key : pickerState.selectedKey;
            renderPickerResults();
        }).catch(function (err) {
            console.warn("CEU referral picker is unavailable.", err);
            renderPickerResults();
        });
        renderPickerResults();
        void loadingPromise;
        window.setTimeout(function () {
            refs.search.focus();
            refs.search.select();
        }, 30);
    }

    function closePicker() {
        const refs = pickerState.refs;
        if (!refs) return;
        const activeInput = pickerState.activeInput;
        refs.modal.hidden = true;
        document.body.classList.remove("lb-referral-picker-open");
        const previousFocus = pickerState.previousFocus;
        pickerState.activeInput = null;
        pickerState.activeOptions = {};
        pickerState.previousFocus = null;
        if (previousFocus && previousFocus !== activeInput && typeof previousFocus.focus === "function") {
            previousFocus.focus();
        } else if (activeInput && typeof activeInput.blur === "function") {
            activeInput.blur();
        }
    }

    function confirmPickerSelection() {
        const input = pickerState.activeInput;
        if (!input || !pickerState.selectedKey) return;
        const item = (state.items || []).find(function (candidate) {
            return candidate.key === pickerState.selectedKey;
        });
        if (!item) return;
        input.value = item.displayName || "";
        dispatchFieldChanged(input);
        closePicker();
    }

    function clearPickerSelection() {
        const input = pickerState.activeInput;
        if (!input) return;
        input.value = "";
        dispatchFieldChanged(input);
        closePicker();
    }

    function attachInput(input, options) {
        if (!input) return null;
        const opts = options || {};

        input.removeAttribute("list");
        input.setAttribute("readonly", "readonly");
        input.classList.add("lb-referral-picker-input");
        input.setAttribute("aria-haspopup", "dialog");
        input.setAttribute("title", "Click to search current CEU referral names");
        if (opts.placeholder && !input.getAttribute("placeholder")) {
            input.setAttribute("placeholder", opts.placeholder);
        }

        const existingTrigger = input.nextElementSibling && input.nextElementSibling.classList && input.nextElementSibling.classList.contains("lb-referral-picker-trigger")
            ? input.nextElementSibling
            : null;
        if (existingTrigger) {
            existingTrigger.remove();
        }

        function handleOpen(event) {
            event.preventDefault();
            openPicker(input, opts);
        }

        input.addEventListener("click", handleOpen);
        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                handleOpen(event);
            }
        });

        attachedInputs.push({ input: input });
        ensurePickerStyles();
        initialize().catch(function (err) {
            console.warn("CEU referral names are unavailable.", err);
        });
        return {
            input: input,
            open: function () {
                openPicker(input, opts);
            }
        };
    }

    window.addEventListener("lb:records-changed", scheduleRefresh);
    window.addEventListener("focus", function () {
        if (!state.ready) return;
        scheduleRefresh();
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && pickerState.refs && !pickerState.refs.modal.hidden) {
            closePicker();
        }
    });

    window.lbCeuReferrals = {
        attachInput: attachInput,
        formatNameValue: formatNameValue,
        formatRecordForDisplay: formatRecordForDisplay,
        getCategoryLabel: getCategoryLabel,
        getHeatColor: getHeatColor,
        getHeatStyle: getHeatStyle,
        getRecordCount: getRecordCount,
        getReferrers: getReferrers,
        getSummaryItems: getSummaryItems,
        initialize: initialize,
        isReady: function () {
            return state.ready;
        },
        isReferralCategory: isReferralCategory,
        normalizeName: normalizeReferralName,
        populateDatalist: populateDatalist,
        refresh: refresh,
        toTitleCaseName: toTitleCaseName
    };
})();
