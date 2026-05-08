(function(){
    "use strict";

    if(!(window.lbAuth && window.lbAuth.requireAuth && window.lbAuth.requireAuth())){
        throw new Error("Unauthorized");
    }

    window.logout = function logout(){
        window.lbAuth.logout();
    };

    const menuToggle = document.getElementById("menuToggle");
    const navOverlay = document.getElementById("navOverlay");
    const navClose = document.getElementById("navClose");
    const navLinks = navOverlay ? navOverlay.querySelectorAll(".nav-item[href]") : [];

    function isMenuOpen(){
        return !!(navOverlay && navOverlay.classList.contains("is-open"));
    }

    function openMenu(){
        if(!navOverlay) return;
        navOverlay.classList.add("is-open");
        navOverlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("menu-open");
        if(menuToggle){
            menuToggle.setAttribute("aria-expanded", "true");
        }
        if(navClose){
            navClose.focus();
        }
    }

    function closeMenu(){
        if(!navOverlay) return;
        navOverlay.classList.remove("is-open");
        navOverlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("menu-open");
        if(menuToggle){
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.focus();
        }
    }

    if(menuToggle){
        menuToggle.addEventListener("click", function(){
            if(isMenuOpen()){
                closeMenu();
                return;
            }
            openMenu();
        });
    }

    if(navClose){
        navClose.addEventListener("click", closeMenu);
    }

    if(navOverlay){
        navOverlay.addEventListener("click", function(event){
            if(event.target === navOverlay){
                closeMenu();
            }
        });
    }

    if(navLinks && navLinks.length){
        navLinks.forEach(function(link){
            link.addEventListener("click", closeMenu);
        });
    }

    document.addEventListener("keydown", function(event){
        if(event.key === "Escape" && isMenuOpen()){
            closeMenu();
        }
    });

    let toastTimeout;
    function showToast(message, type){
        const toast = document.getElementById("toast");
        if(!toast) return;
        toast.textContent = message;
        toast.className = "toast show";
        if(type === "success"){
            toast.classList.add("success");
        } else if(type === "error"){
            toast.classList.add("error");
        }
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(function(){
            toast.className = "toast";
        }, 3200);
    }

    function normalizeAssistanceText(value){
        return String(value || "")
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeAssistanceType(typeValue, legacyValue){
        const direct = String(typeValue || "").trim();
        const legacy = String(legacyValue || "").trim();
        const program = String(arguments.length > 2 ? arguments[2] : "").trim();

        if(!direct){
            if(program) return program;
            if(legacy) return legacy;
            return "";
        }

        const labelMap = {
            "medical": "Medical",
            "hospital": "Hospital",
            "pcso": "PCSO",
            "transport": "Transport",
            "guarantee letter": "Guarantee Letter",
            "special case": "Special Case",
            "promissory": "Promissory",
            "request": "Request",
            "solicitation": "Solicitation",
            "legal": "Legal",
            "referral": "Referral",
            "maytrabaho": "MayTrabaho",
            "activity": "Activity",
            "event": "Event",
            "agricultural": "Agricultural",
            "environmental": "Environmental",
            "educational": "Educational",
            "hapag": "Hapag",
            "consultation": "Consultation",
            "visitation": "Visitation",
            "speaking": "Speaking"
        };

        const normalized = normalizeAssistanceText(direct);
        if(labelMap[normalized]) return labelMap[normalized];
        if(normalized === "program"){
            return program || legacy || "";
        }
        if(normalized === "request" || normalized === "medical"){
            return program || legacy || direct;
        }
        return direct;
    }

    function normalizeRecordShape(record){
        if(!record || typeof record !== "object") return {};
        const next = Object.assign({}, record);
        let programValue = "";

        if(Array.isArray(next.programs)){
            programValue = String(next.programs[0] || "").trim();
        } else if(typeof next.programs === "string"){
            programValue = String(next.programs || "").trim();
        }

        next.type = normalizeAssistanceType(next.type, next.services, programValue);

        if(Object.prototype.hasOwnProperty.call(next, "services")){
            delete next.services;
        }

        if(Array.isArray(next.history)){
            next.history = next.history.map(function(item){
                if(!item || typeof item !== "object") return item;
                const historyItem = Object.assign({}, item);
                historyItem.type = normalizeAssistanceType(historyItem.type, historyItem.services);
                if(Object.prototype.hasOwnProperty.call(historyItem, "services")){
                    delete historyItem.services;
                }
                return historyItem;
            });
        }

        return next;
    }

    function safeGetRecords(){
        if(window.lbData && typeof window.lbData.getRecords === "function"){
            return window.lbData.getRecords().map(normalizeRecordShape);
        }

        if(window.lbSupabase && window.lbSupabase.isEnabled && window.lbSupabase.isEnabled()){
            console.warn("Cloud mode is enabled but the shared records store is unavailable.");
            return [];
        }

        try {
            const raw = localStorage.getItem("records");
            if(!raw) return [];
            const parsed = JSON.parse(raw);
            if(!Array.isArray(parsed)) return [];
            return parsed.map(normalizeRecordShape);
        } catch(err){
            console.error("Failed to parse records from localStorage", err);
            return [];
        }
    }

    const RECORDS_MIGRATION_KEY = "lb_records_type_migration_v2";
    function migrateRecordsOnce(){
        if(window.lbData && window.lbData.isCloudEnabled && window.lbData.isCloudEnabled()){
            return;
        }

        try {
            if(localStorage.getItem(RECORDS_MIGRATION_KEY) === "1") return;
            const raw = localStorage.getItem("records");
            if(!raw){
                localStorage.setItem(RECORDS_MIGRATION_KEY, "1");
                return;
            }

            const parsed = JSON.parse(raw);
            if(!Array.isArray(parsed)){
                localStorage.setItem(RECORDS_MIGRATION_KEY, "1");
                return;
            }

            let changed = false;
            const migrated = parsed.map(function(record){
                const normalized = normalizeRecordShape(record);
                if(!changed && JSON.stringify(normalized) !== JSON.stringify(record)){
                    changed = true;
                }
                return normalized;
            });

            if(changed){
                localStorage.setItem("records", JSON.stringify(migrated));
            }
            localStorage.setItem(RECORDS_MIGRATION_KEY, "1");
        } catch(err){
            console.warn("Record migration failed", err);
        }
    }

    migrateRecordsOnce();
    let data = safeGetRecords();

    async function initializeSharedRecords(){
        if(!(window.lbData && typeof window.lbData.initialize === "function")){
            return data;
        }

        try {
            await window.lbData.initialize();
            data = safeGetRecords();
        } catch(err){
            console.error("Failed to initialize shared records store", err);
            showToast(
                window.lbData && typeof window.lbData.explainError === "function"
                    ? window.lbData.explainError(err)
                    : "Failed to load shared records.",
                "error"
            );
        }

        return data;
    }

    function saveToStorage(){
        if(window.lbData && window.lbData.isCloudEnabled && window.lbData.isCloudEnabled()){
            return;
        }

        try {
            localStorage.setItem("records", JSON.stringify(Array.isArray(data) ? data : []));
        } catch(err){
            console.error("Failed to save records to localStorage", err);
            showToast("Failed to save records.", "error");
        }
    }

    function formatCount(value){
        return Number(value || 0).toLocaleString();
    }

    function getBackupInfo(){
        if(window.lbData && typeof window.lbData.getBackupInfo === "function"){
            return window.lbData.getBackupInfo();
        }
        return { exists: false, count: 0, createdAt: "" };
    }

    function setBadge(id, label, tone){
        const badge = document.getElementById(id);
        if(!badge) return;
        badge.textContent = label;
        badge.className = "status-badge";
        if(tone){
            badge.classList.add(tone);
        }
    }

    function updatePageSummary(){
        const storageEl = document.getElementById("summaryStorage");
        const recordsEl = document.getElementById("summaryRecords");
        const backupEl = document.getElementById("summaryBackup");
        const cloudEnabled = !!(window.lbData && window.lbData.isCloudEnabled && window.lbData.isCloudEnabled());
        const backupInfo = getBackupInfo();

        if(storageEl){
            storageEl.textContent = cloudEnabled ? "Supabase" : "Browser";
        }
        if(recordsEl){
            recordsEl.textContent = formatCount((Array.isArray(data) ? data : []).length);
        }
        if(backupEl){
            backupEl.textContent = formatCount(backupInfo.count);
        }
    }

    const migrationUiState = {
        importing: false,
        lastResult: null
    };

    function updateMigrationBanner(){
        const message = document.getElementById("migrationMessage");
        const importBtn = document.getElementById("importBackupBtn");
        const clearBtn = document.getElementById("clearBackupBtn");
        if(!message || !importBtn || !clearBtn) return;

        const cloudEnabled = !!(window.lbData && window.lbData.isCloudEnabled && window.lbData.isCloudEnabled());
        const backupInfo = getBackupInfo();
        const hasBackup = !!backupInfo.count;

        importBtn.disabled = migrationUiState.importing || !cloudEnabled || !hasBackup;
        clearBtn.disabled = migrationUiState.importing || !hasBackup;

        if(migrationUiState.importing){
            setBadge("migrationStatus", "Importing", "warning");
            message.textContent = "Importing preserved browser backup records into the shared Supabase database.";
            importBtn.textContent = "Importing...";
            clearBtn.textContent = "Clear Backup";
            return;
        }

        importBtn.textContent = "Import One-Time Backup";
        clearBtn.textContent = "Clear Backup";

        if(!cloudEnabled){
            setBadge("migrationStatus", "Unavailable", "danger");
            message.textContent = "This tool becomes active when the shared Supabase database is enabled for this app.";
            return;
        }

        if(migrationUiState.lastResult){
            setBadge("migrationStatus", "Done", "success");
            message.textContent = "Last import: " +
                migrationUiState.lastResult.imported + " imported, " +
                migrationUiState.lastResult.skipped + " skipped. " +
                backupInfo.count + " backup record(s) remain until you clear them.";
            return;
        }

        if(hasBackup){
            const createdLabel = backupInfo.createdAt
                ? new Date(backupInfo.createdAt).toLocaleString()
                : "an earlier session";
            setBadge("migrationStatus", "Ready", "success");
            message.textContent = backupInfo.count +
                " preserved browser backup record(s) were found from " + createdLabel +
                ". Import them into Supabase before clearing the backup.";
            return;
        }

        setBadge("migrationStatus", "Empty", "warning");
        message.textContent = "No preserved browser backup records were found.";
    }

    async function handleImportBackup(){
        if(!(window.lbData && typeof window.lbData.importBackupRecords === "function")){
            showToast("Backup import is unavailable on this page.", "error");
            return;
        }

        migrationUiState.importing = true;
        updateMigrationBanner();

        try {
            const result = await window.lbData.importBackupRecords();
            migrationUiState.lastResult = result;
            data = safeGetRecords();
            updatePageSummary();

            if(result.imported > 0){
                showToast("Imported " + result.imported + " backup record(s) to Supabase.", "success");
            } else {
                showToast("No new backup records needed to be imported.", "success");
            }
        } catch(err){
            console.error("Failed to import backup records", err);
            showToast("Failed to import browser backup records.", "error");
        } finally {
            migrationUiState.importing = false;
            updateMigrationBanner();
        }
    }

    function handleClearBackup(){
        if(!(window.lbData && typeof window.lbData.clearBackup === "function")){
            showToast("Backup clearing is unavailable on this page.", "error");
            return;
        }

        const confirmed = window.confirm("Clear the preserved browser backup records? Do this only after you verify the Supabase import.");
        if(!confirmed) return;

        window.lbData.clearBackup();
        migrationUiState.lastResult = null;
        updatePageSummary();
        updateMigrationBanner();
        showToast("Browser backup cleared.", "success");
    }

    const excelImportState = {
        busy: false,
        stage: "",
        lastResult: null,
        activeSummary: ""
    };

    function updateExcelImportBanner(){
        const message = document.getElementById("excelImportMessage");
        const button = document.getElementById("importExcelBtn");
        if(!message || !button) return;

        button.disabled = excelImportState.busy;

        if(excelImportState.busy){
            setBadge("excelImportStatus", "Working", "warning");
            button.textContent = excelImportState.stage || "Importing...";
            message.textContent = excelImportState.activeSummary
                ? excelImportState.activeSummary + " Import is running now."
                : "Reading workbook and syncing records. This may take a while for large files.";
            return;
        }

        button.textContent = "Import Excel";

        if(excelImportState.lastResult){
            setBadge("excelImportStatus", "Done", "success");
            const result = excelImportState.lastResult;
            message.textContent = "Last import: " + result.fileName +
                " | " + result.totalRows + " rows read, " +
                result.created + " new clients, " +
                result.updated + " updated records, " +
                result.historyAdded + " history entries, " +
                result.duplicateSkipped + " duplicate rows skipped.";
            return;
        }

        setBadge("excelImportStatus", "Ready", "success");
        message.textContent = "Import an LBU Excel workbook. Matching clients will stay on one client record, and repeat rows will be added to history.";
    }

    async function createRecordsInStore(records){
        const queue = Array.isArray(records) ? records.filter(Boolean) : [];
        if(!queue.length) return [];

        if(window.lbData && typeof window.lbData.createRecords === "function"){
            const created = await window.lbData.createRecords(queue);
            data = safeGetRecords();
            return created;
        }

        if(window.lbData && typeof window.lbData.createRecord === "function"){
            const created = [];
            for(let index = 0; index < queue.length; index += 1){
                created.push(await window.lbData.createRecord(queue[index]));
            }
            data = safeGetRecords();
            return created;
        }

        const localRecords = safeGetRecords();
        let nextId = localRecords.length > 0
            ? Math.max.apply(null, localRecords.map(function(item){ return Number(item.id) || 0; })) + 1
            : 1;
        const created = queue.map(function(record){
            return Object.assign({}, record, { id: nextId++ });
        });
        data = localRecords.concat(created);
        saveToStorage();
        return created;
    }

    async function updateRecordsInStore(records){
        const queue = Array.isArray(records)
            ? records.filter(function(record){ return record && record.id != null; })
            : [];
        if(!queue.length) return [];

        if(window.lbData && typeof window.lbData.updateRecords === "function"){
            const updated = await window.lbData.updateRecords(queue);
            data = safeGetRecords();
            return updated;
        }

        if(window.lbData && typeof window.lbData.updateRecord === "function"){
            const updated = [];
            for(let index = 0; index < queue.length; index += 1){
                updated.push(await window.lbData.updateRecord(queue[index]));
            }
            data = safeGetRecords();
            return updated;
        }

        const updatesById = new Map(queue.map(function(record){
            return [String(record.id), record];
        }));
        data = data.map(function(record){
            return updatesById.get(String(record.id)) || record;
        });
        saveToStorage();
        return queue;
    }

    async function persistExcelImportChanges(changes){
        const creates = Array.isArray(changes && changes.creates) ? changes.creates : [];
        const updates = Array.isArray(changes && changes.updates) ? changes.updates : [];

        if(creates.length){
            await createRecordsInStore(creates);
        }
        if(updates.length){
            await updateRecordsInStore(updates);
        }

        data = safeGetRecords();
    }

    function buildExcelImportSummary(parsed){
        const supportedSheets = Array.isArray(parsed && parsed.supportedSheets) ? parsed.supportedSheets : [];
        if(!supportedSheets.length) return "No supported client-record sheet was found in the workbook.";

        const details = supportedSheets
            .map(function(sheet){
                return sheet.name + ": " + sheet.rowCount;
            })
            .join(", ");

        return "Found " + parsed.rows.length + " importable row(s) in " +
            supportedSheets.length + " sheet(s) (" + details + ").";
    }

    function escapeXml(value){
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getColumnName(index){
        let value = Number(index) + 1;
        let name = "";
        while(value > 0){
            const remainder = (value - 1) % 26;
            name = String.fromCharCode(65 + remainder) + name;
            value = Math.floor((value - 1) / 26);
        }
        return name;
    }

    function buildTemplateSheetXml(headers){
        const headerCells = headers.map(function(header, index){
            const cellRef = getColumnName(index) + "1";
            return '<c r="' + cellRef + '" t="inlineStr"><is><t>' + escapeXml(header) + '</t></is></c>';
        }).join("");

        const columns = headers.map(function(_, index){
            const columnNumber = index + 1;
            return '<col min="' + columnNumber + '" max="' + columnNumber + '" width="24" customWidth="1"/>';
        }).join("");

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<cols>' + columns + '</cols>' +
            '<sheetData><row r="1">' + headerCells + '</row></sheetData>' +
            '</worksheet>';
    }

    const crcTable = (function(){
        const table = [];
        for(let index = 0; index < 256; index += 1){
            let value = index;
            for(let bit = 0; bit < 8; bit += 1){
                value = value & 1 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
            }
            table[index] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes){
        let crc = 0xffffffff;
        for(let index = 0; index < bytes.length; index += 1){
            crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function concatBytes(chunks){
        const total = chunks.reduce(function(sum, chunk){
            return sum + chunk.length;
        }, 0);
        const output = new Uint8Array(total);
        let offset = 0;
        chunks.forEach(function(chunk){
            output.set(chunk, offset);
            offset += chunk.length;
        });
        return output;
    }

    function numberBytes(value, byteCount){
        const bytes = new Uint8Array(byteCount);
        const view = new DataView(bytes.buffer);
        if(byteCount === 2){
            view.setUint16(0, value, true);
        } else {
            view.setUint32(0, value, true);
        }
        return bytes;
    }

    function createXlsxBlob(files){
        const encoder = new TextEncoder();
        const localChunks = [];
        const centralChunks = [];
        let offset = 0;

        files.forEach(function(file){
            const nameBytes = encoder.encode(file.name);
            const dataBytes = encoder.encode(file.content);
            const checksum = crc32(dataBytes);
            const localHeader = concatBytes([
                numberBytes(0x04034b50, 4),
                numberBytes(20, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(checksum, 4),
                numberBytes(dataBytes.length, 4),
                numberBytes(dataBytes.length, 4),
                numberBytes(nameBytes.length, 2),
                numberBytes(0, 2),
                nameBytes
            ]);

            localChunks.push(localHeader, dataBytes);

            const centralHeader = concatBytes([
                numberBytes(0x02014b50, 4),
                numberBytes(20, 2),
                numberBytes(20, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(checksum, 4),
                numberBytes(dataBytes.length, 4),
                numberBytes(dataBytes.length, 4),
                numberBytes(nameBytes.length, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 2),
                numberBytes(0, 4),
                numberBytes(offset, 4),
                nameBytes
            ]);
            centralChunks.push(centralHeader);
            offset += localHeader.length + dataBytes.length;
        });

        const centralDirectory = concatBytes(centralChunks);
        const endOfCentralDirectory = concatBytes([
            numberBytes(0x06054b50, 4),
            numberBytes(0, 2),
            numberBytes(0, 2),
            numberBytes(files.length, 2),
            numberBytes(files.length, 2),
            numberBytes(centralDirectory.length, 4),
            numberBytes(offset, 4),
            numberBytes(0, 2)
        ]);

        return new Blob([concatBytes(localChunks), centralDirectory, endOfCentralDirectory], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
    }

    function createExcelTemplateBlob(){
        const headers = window.lbRecordExcelImport && typeof window.lbRecordExcelImport.getTemplateHeaders === "function"
            ? window.lbRecordExcelImport.getTemplateHeaders()
            : [];
        const worksheetXml = buildTemplateSheetXml(headers);
        const files = [
            {
                name: "[Content_Types].xml",
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                    '<Default Extension="xml" ContentType="application/xml"/>' +
                    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
                    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                    '</Types>'
            },
            {
                name: "_rels/.rels",
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
                    '</Relationships>'
            },
            {
                name: "xl/workbook.xml",
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                    '<sheets><sheet name="LINGKOD BAYAN TEMPLATE" sheetId="1" r:id="rId1"/></sheets>' +
                    '</workbook>'
            },
            {
                name: "xl/_rels/workbook.xml.rels",
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
                    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
                    '</Relationships>'
            },
            {
                name: "xl/worksheets/sheet1.xml",
                content: worksheetXml
            },
            {
                name: "xl/styles.xml",
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
                    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
                    '<borders count="1"><border/></borders>' +
                    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
                    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>' +
                    '</styleSheet>'
            }
        ];

        return createXlsxBlob(files);
    }

    function downloadExcelTemplate(){
        if(!(window.lbRecordExcelImport && typeof window.lbRecordExcelImport.getTemplateHeaders === "function")){
            showToast("Excel template generator is unavailable.", "error");
            return;
        }

        const blob = createExcelTemplateBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "lingkod-bayan-client-record-template.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function(){
            URL.revokeObjectURL(url);
        }, 1000);
        showToast("Excel template downloaded.", "success");
    }

    function buildColumnWarning(parsed){
        const sheets = Array.isArray(parsed && parsed.supportedSheets) ? parsed.supportedSheets : [];
        const messages = [];

        sheets.forEach(function(sheet){
            const missing = Array.isArray(sheet && sheet.missingTemplateHeaders) ? sheet.missingTemplateHeaders : [];
            if(!missing.length) return;

            const required = missing.filter(function(item){ return item.required; }).map(function(item){ return item.label; });
            const recommended = missing.filter(function(item){ return !item.required; }).map(function(item){ return item.label; });
            const parts = [];
            if(required.length) parts.push("required: " + required.join(", "));
            if(recommended.length) parts.push("recommended: " + recommended.join(", "));
            messages.push((sheet.name || "Sheet") + " missing " + parts.join("; "));
        });

        if(Array.isArray(parsed && parsed.skippedSheets) && parsed.skippedSheets.length){
            messages.push("Skipped unsupported sheet(s): " + parsed.skippedSheets.join(", "));
        }

        if(!messages.length) return "";
        return "Excel columns need review before saving:\n\n" +
            messages.map(function(message){ return "- " + message; }).join("\n") +
            "\n\nKeep the downloaded template headers unchanged for consistent imports.\n\nContinue saving this import?";
    }

    async function handleExcelImportSelection(event){
        const input = event && event.target ? event.target : document.getElementById("excelImportInput");
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        if(!file) return;

        if(!(window.lbRecordExcelImport && typeof window.lbRecordExcelImport.parseFile === "function")){
            showToast("Excel import is unavailable on this page.", "error");
            if(input) input.value = "";
            return;
        }

        excelImportState.busy = true;
        excelImportState.stage = "Reading Excel...";
        excelImportState.activeSummary = "";
        updateExcelImportBanner();

        try {
            const parsed = await window.lbRecordExcelImport.parseFile(file);
            if(!parsed.rows.length){
                showToast("No supported client rows were found in that workbook.", "error");
                return;
            }

            excelImportState.activeSummary = buildExcelImportSummary(parsed);
            excelImportState.stage = "Preparing records...";
            updateExcelImportBanner();

            const columnWarning = buildColumnWarning(parsed);
            if(columnWarning && !window.confirm(columnWarning)){
                showToast("Excel import cancelled before save.", "error");
                return;
            }

            const changes = window.lbRecordExcelImport.buildImportChanges(safeGetRecords(), parsed.rows);
            if(!changes.creates.length && !changes.updates.length && !changes.stats.duplicateSkipped){
                showToast("No new rows were ready to import.", "success");
                return;
            }

            excelImportState.stage = "Saving records...";
            updateExcelImportBanner();
            await persistExcelImportChanges(changes);
            updatePageSummary();

            excelImportState.lastResult = {
                fileName: file.name,
                totalRows: changes.stats.totalRows,
                created: changes.stats.created,
                updated: changes.stats.updated,
                historyAdded: changes.stats.historyAdded,
                duplicateSkipped: changes.stats.duplicateSkipped
            };

            showToast(
                "Excel import finished: " +
                changes.stats.created + " new client(s), " +
                changes.stats.updated + " updated record(s), " +
                changes.stats.historyAdded + " history " +
                (changes.stats.historyAdded === 1 ? "entry." : "entries."),
                "success"
            );
        } catch(err){
            console.error("Failed to import Excel workbook", err);
            const message = window.lbData && typeof window.lbData.explainError === "function"
                ? window.lbData.explainError(err)
                : (err && err.message ? err.message : "Failed to import Excel workbook.");
            showToast(message, "error");
        } finally {
            excelImportState.busy = false;
            excelImportState.stage = "";
            excelImportState.activeSummary = "";
            updateExcelImportBanner();
            if(input) input.value = "";
        }
    }

    const importBackupBtn = document.getElementById("importBackupBtn");
    if(importBackupBtn){
        importBackupBtn.addEventListener("click", handleImportBackup);
    }

    const clearBackupBtn = document.getElementById("clearBackupBtn");
    if(clearBackupBtn){
        clearBackupBtn.addEventListener("click", handleClearBackup);
    }

    const downloadExcelTemplateBtn = document.getElementById("downloadExcelTemplateBtn");
    if(downloadExcelTemplateBtn){
        downloadExcelTemplateBtn.addEventListener("click", downloadExcelTemplate);
    }

    const importExcelBtn = document.getElementById("importExcelBtn");
    const excelImportInput = document.getElementById("excelImportInput");
    if(importExcelBtn && excelImportInput){
        importExcelBtn.addEventListener("click", function(){
            if(excelImportState.busy) return;
            excelImportInput.value = "";
            excelImportInput.click();
        });

        excelImportInput.addEventListener("change", handleExcelImportSelection);
    }

    window.addEventListener("lb:records-changed", function(){
        data = safeGetRecords();
        updatePageSummary();
        updateMigrationBanner();
        updateExcelImportBanner();
    });

    initializeSharedRecords().finally(function(){
        data = safeGetRecords();
        updatePageSummary();
        updateMigrationBanner();
        updateExcelImportBanner();
        if(window.lbRoutes && typeof window.lbRoutes.markRouteLoaded === "function"){
            window.lbRoutes.markRouteLoaded("importTools");
        }
    });
})();
