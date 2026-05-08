/* Shared records store.
   Uses Supabase when configured, otherwise falls back to localStorage. */
(function () {
    "use strict";

    const RECORDS_STORAGE_KEY = "records";
    const LOCAL_BACKUP_KEY = "lb_records_local_backup_v1";
    const CHANGE_EVENT_NAME = "lb:records-changed";

    let cachedRecords = [];
    let initializePromise = null;
    let realtimeChannel = null;
    let refreshTimer = null;
    let lastError = null;
    const CLOUD_FETCH_PAGE_SIZE = 1000;

    if (!isCloudEnabled()) {
        cachedRecords = readLocalRecords();
    }

    function safeClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return value;
        }
    }

    function setLastError(error) {
        if (!error) {
            lastError = null;
            return null;
        }

        if (error instanceof Error) {
            lastError = error;
            return lastError;
        }

        lastError = new Error(String(error));
        return lastError;
    }

    function getLastError() {
        return lastError;
    }

    function explainError(error) {
        const target = error || lastError;
        const message = String(target && target.message ? target.message : target || "").trim();

        if (!message) {
            return "Failed to load shared records.";
        }

        if (/not an active admin/i.test(message)) {
            return "This login exists in Supabase Auth, but it is not yet registered in the admin allow-list. Run the admin setup SQL for this email.";
        }

        if (/requires mfa/i.test(message)) {
            return "This admin account requires MFA before it can access records.";
        }

        if (/row-level security|permission denied|not allowed/i.test(message)) {
            if (/record_audit_logs/i.test(message)) {
                return "Supabase blocked the audit log trigger. Re-run the latest supabase/setup.sql in the Supabase SQL editor, then try the import again.";
            }
            return "Supabase denied access to records. Check the admin allow-list and the RLS policies in supabase/setup.sql.";
        }

        if (/relation .* does not exist|could not find the table|schema cache/i.test(message)) {
            return "The required Supabase tables were not found. Run supabase/setup.sql in the Supabase SQL editor.";
        }

        if (/failed to fetch|networkerror|load the supabase browser sdk/i.test(message)) {
            return "Failed to connect to Supabase. Check the internet connection and the Supabase URL/key in assets/js/supabase-config.js.";
        }

        if (/jwt|session/i.test(message) && /invalid|missing|expired|refresh/i.test(message)) {
            return "Your Supabase session is no longer valid. Sign in again.";
        }

        return message;
    }

    function readLocalRecords() {
        try {
            const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn("Failed to read records from localStorage.", err);
            return [];
        }
    }

    function clearLegacyRecordStorage() {
        try {
            localStorage.removeItem(RECORDS_STORAGE_KEY);
        } catch (err) {
            console.warn("Failed to clear legacy local records.", err);
        }
    }

    function readBackupSnapshot() {
        try {
            const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.records)) return null;
            return parsed;
        } catch (err) {
            console.warn("Failed to read the local records backup.", err);
            return null;
        }
    }

    function writeBackupSnapshot(snapshot) {
        try {
            localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(snapshot));
        } catch (err) {
            console.warn("Failed to write the local records backup.", err);
        }
    }

    function getBackupRecords() {
        const snapshot = readBackupSnapshot();
        return snapshot && Array.isArray(snapshot.records) ? safeClone(snapshot.records) : [];
    }

    function getBackupInfo() {
        const snapshot = readBackupSnapshot();
        const records = snapshot && Array.isArray(snapshot.records) ? snapshot.records : [];
        return {
            exists: !!snapshot,
            count: records.length,
            createdAt: snapshot && snapshot.createdAt ? snapshot.createdAt : ""
        };
    }

    function clearBackup() {
        try {
            localStorage.removeItem(LOCAL_BACKUP_KEY);
        } catch (err) {
            console.warn("Failed to clear the local records backup.", err);
        }
    }

    function createStableValue(value) {
        if (Array.isArray(value)) {
            return value.map(createStableValue);
        }

        if (value && typeof value === "object") {
            const out = {};
            Object.keys(value).sort().forEach(function (key) {
                if (key === "id") return;
                out[key] = createStableValue(value[key]);
            });
            return out;
        }

        return value;
    }

    function buildRecordFingerprint(record) {
        return JSON.stringify(createStableValue(safeClone(record || {})));
    }

    function backupLegacyRecordsIfNeeded() {
        if (!isCloudEnabled()) return getBackupInfo();
        if (readBackupSnapshot()) {
            clearLegacyRecordStorage();
            return getBackupInfo();
        }

        const currentRecords = readLocalRecords();
        if (!currentRecords.length) {
            clearLegacyRecordStorage();
            return getBackupInfo();
        }

        writeBackupSnapshot({
            createdAt: new Date().toISOString(),
            records: currentRecords
        });
        clearLegacyRecordStorage();
        return getBackupInfo();
    }

    function setCachedRecords(records, shouldDispatch) {
        cachedRecords = Array.isArray(records) ? safeClone(records) : [];
        if (shouldDispatch !== false) {
            dispatchRecordsChanged();
        }
    }

    function dispatchRecordsChanged() {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT_NAME, {
            detail: {
                records: getRecords(),
                cloudEnabled: isCloudEnabled()
            }
        }));
    }

    function isCloudEnabled() {
        return !!(window.lbSupabase && window.lbSupabase.isEnabled && window.lbSupabase.isEnabled());
    }

    function getConfig() {
        const config = window.LBU_SUPABASE_CONFIG || {};
        return {
            attachmentsTable: config.attachmentsTable || "record_attachments",
            auditTable: config.auditTable || "record_audit_logs",
            schema: config.schema || "public",
            recordsTable: config.recordsTable || "lb_records"
        };
    }

    function getRecords() {
        if (!Array.isArray(cachedRecords)) {
            cachedRecords = [];
        }
        return safeClone(cachedRecords);
    }

    function rowToRecord(row) {
        const payload = row && row.record && typeof row.record === "object" ? row.record : {};
        const next = Object.assign({}, payload);
        next.id = row.id;
        return next;
    }

    function scheduleRefreshFromRealtime() {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }

        refreshTimer = setTimeout(function () {
            refreshTimer = null;
            refreshRecords().catch(function (err) {
                console.error("Realtime refresh failed.", err);
            });
        }, 120);
    }

    async function subscribeToRealtime() {
        if (!isCloudEnabled()) return;
        if (realtimeChannel) return;
        if (!(window.lbAuth && window.lbAuth.isAuthenticated && window.lbAuth.isAuthenticated())) {
            return;
        }

        const client = await window.lbSupabase.getClient();
        if (!client) return;

        const config = getConfig();
        realtimeChannel = client
            .channel("lb-records-sync")
            .on("postgres_changes", {
                event: "*",
                schema: config.schema,
                table: config.recordsTable
            }, function () {
                scheduleRefreshFromRealtime();
            })
            .subscribe();
    }

    async function fetchAllCloudRecordRows(client, config) {
        const rows = [];
        const seenIds = new Set();
        let from = 0;

        while (true) {
            const response = await client
                .from(config.recordsTable)
                .select("id, record, updated_at")
                .order("id", { ascending: true })
                .range(from, from + CLOUD_FETCH_PAGE_SIZE - 1);

            if (response.error) {
                throw response.error;
            }

            const batch = Array.isArray(response.data) ? response.data : [];
            if (!batch.length) {
                break;
            }

            batch.forEach(function (row) {
                const id = String(row && row.id != null ? row.id : "");
                if (!id || seenIds.has(id)) return;
                seenIds.add(id);
                rows.push(row);
            });

            from += batch.length;
        }

        return rows;
    }

    async function refreshRecords(options) {
        const opts = options || {};
        let client = null;
        let session = null;

        if (!isCloudEnabled()) {
            setLastError(null);
            setCachedRecords(readLocalRecords(), opts.dispatch);
            return getRecords();
        }

        try {
            client = await window.lbSupabase.getClient();
            if (!client) {
                setLastError(null);
                setCachedRecords([], opts.dispatch);
                return getRecords();
            }

            if (client.auth && typeof client.auth.getSession === "function") {
                const sessionResponse = await client.auth.getSession();
                if (sessionResponse && sessionResponse.error) {
                    throw sessionResponse.error;
                }
                session = sessionResponse && sessionResponse.data ? sessionResponse.data.session : null;
            }

            if (!session || !session.access_token || !session.user) {
                setLastError(null);
                setCachedRecords([], opts.dispatch);
                return getRecords();
            }

            if (window.lbAuth && typeof window.lbAuth.refreshCloudAdminProfile === "function") {
                await window.lbAuth.refreshCloudAdminProfile({
                    client: client,
                    session: session,
                    user: session.user,
                    throwOnFailure: true
                });
            }

            const config = getConfig();
            const rows = await fetchAllCloudRecordRows(client, config);
            setLastError(null);
            setCachedRecords(rows.map(rowToRecord), opts.dispatch);
            return getRecords();
        } catch (err) {
            setLastError(err);
            throw err;
        }
    }

    function upsertCachedRecord(record) {
        const next = safeClone(record);
        const nextRecords = getRecords();
        const index = nextRecords.findIndex(function (item) {
            return String(item.id) === String(next.id);
        });

        if (index >= 0) {
            nextRecords[index] = next;
        } else {
            nextRecords.push(next);
            nextRecords.sort(function (a, b) {
                return Number(a.id) - Number(b.id);
            });
        }

        setCachedRecords(nextRecords, true);
    }

    function removeCachedRecord(recordId) {
        const nextRecords = getRecords().filter(function (record) {
            return String(record.id) !== String(recordId);
        });
        setCachedRecords(nextRecords, true);
    }

    function clearCachedRecords() {
        setCachedRecords([], true);
    }

    async function initialize() {
        if (initializePromise) {
            return initializePromise;
        }

        initializePromise = (async function () {
            if (isCloudEnabled()) {
                backupLegacyRecordsIfNeeded();
                await refreshRecords({ dispatch: false });
                await subscribeToRealtime();
            } else {
                setLastError(null);
                setCachedRecords(readLocalRecords(), false);
            }

            dispatchRecordsChanged();
            return getRecords();
        })().catch(function (err) {
            initializePromise = null;
            throw err;
        });

        return initializePromise;
    }

    async function createRecord(record) {
        if (!isCloudEnabled()) {
            const localRecords = readLocalRecords();
            const nextId = localRecords.length > 0
                ? Math.max.apply(null, localRecords.map(function (item) { return Number(item.id) || 0; })) + 1
                : 1;
            const nextRecord = Object.assign({}, record, { id: nextId });
            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(localRecords.concat([nextRecord])));
            setCachedRecords(readLocalRecords(), true);
            return safeClone(nextRecord);
        }

        await initialize();
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const payload = safeClone(record || {});
        delete payload.id;

        const response = await client
            .from(config.recordsTable)
            .insert({ record: payload })
            .select("id, record")
            .single();

        if (response.error) {
            throw response.error;
        }

        const saved = rowToRecord(response.data);
        upsertCachedRecord(saved);
        return safeClone(saved);
    }

    async function createRecords(records) {
        const queue = Array.isArray(records) ? records.filter(Boolean) : [];
        if (!queue.length) return [];

        if (!isCloudEnabled()) {
            const localRecords = readLocalRecords();
            let nextId = localRecords.length > 0
                ? Math.max.apply(null, localRecords.map(function (item) { return Number(item.id) || 0; })) + 1
                : 1;

            const created = queue.map(function (record) {
                const nextRecord = Object.assign({}, safeClone(record), { id: nextId });
                nextId += 1;
                return nextRecord;
            });

            const nextRecords = localRecords.concat(created);
            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
            setCachedRecords(nextRecords, true);
            return safeClone(created);
        }

        await initialize();
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const batchSize = 100;
        const created = [];

        for (let index = 0; index < queue.length; index += batchSize) {
            const batch = queue.slice(index, index + batchSize).map(function (record) {
                const payload = safeClone(record || {});
                delete payload.id;
                return { record: payload };
            });

            const response = await client
                .from(config.recordsTable)
                .insert(batch)
                .select("id, record");

            if (response.error) {
                throw response.error;
            }

            created.push.apply(created, (Array.isArray(response.data) ? response.data : []).map(rowToRecord));
        }

        await refreshRecords({ dispatch: true });
        return safeClone(created);
    }

    async function updateRecord(record) {
        const nextRecord = safeClone(record || {});
        if (!nextRecord.id) {
            throw new Error("Cannot update a record without an id.");
        }

        if (!isCloudEnabled()) {
            const localRecords = readLocalRecords();
            const nextRecords = localRecords.map(function (item) {
                return String(item.id) === String(nextRecord.id) ? nextRecord : item;
            });
            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
            setCachedRecords(nextRecords, true);
            return safeClone(nextRecord);
        }

        await initialize();
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const recordId = nextRecord.id;
        delete nextRecord.id;

        const response = await client
            .from(config.recordsTable)
            .update({ record: nextRecord })
            .eq("id", recordId)
            .select("id, record")
            .single();

        if (response.error) {
            throw response.error;
        }

        const saved = rowToRecord(response.data);
        upsertCachedRecord(saved);
        return safeClone(saved);
    }

    async function updateRecords(records) {
        const queue = Array.isArray(records)
            ? records.filter(function (record) {
                return record && record.id != null;
            }).map(safeClone)
            : [];

        if (!queue.length) return [];

        if (!isCloudEnabled()) {
            const updatesById = new Map(queue.map(function (record) {
                return [String(record.id), record];
            }));

            const localRecords = readLocalRecords();
            const nextRecords = localRecords.map(function (record) {
                const update = updatesById.get(String(record.id));
                return update ? update : record;
            });

            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
            setCachedRecords(nextRecords, true);
            return safeClone(queue);
        }

        await initialize();
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const batchSize = 100;

        for (let index = 0; index < queue.length; index += batchSize) {
            const batch = queue.slice(index, index + batchSize).map(function (record) {
                const payload = safeClone(record || {});
                const recordId = payload.id;
                delete payload.id;
                return {
                    id: recordId,
                    record: payload
                };
            });

            const response = await client
                .from(config.recordsTable)
                .upsert(batch, { onConflict: "id" })
                .select("id, record");

            if (response.error) {
                throw response.error;
            }
        }

        await refreshRecords({ dispatch: true });
        return safeClone(queue);
    }

    async function deleteRecord(recordId) {
        if (!isCloudEnabled()) {
            const localRecords = readLocalRecords();
            const nextRecords = localRecords.filter(function (record) {
                return String(record.id) !== String(recordId);
            });
            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
            setCachedRecords(nextRecords, true);
            return;
        }

        await initialize();
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const response = await client
            .from(config.recordsTable)
            .delete()
            .eq("id", recordId);

        if (response.error) {
            throw response.error;
        }

        removeCachedRecord(recordId);
    }

    async function clearAllRecords() {
        if (!isCloudEnabled()) {
            const deletedCount = readLocalRecords().length;
            try {
                localStorage.removeItem(RECORDS_STORAGE_KEY);
            } catch (err) {
                console.warn("Failed to clear local records.", err);
                throw err;
            }

            clearCachedRecords();
            return { deleted: deletedCount };
        }

        await initialize();
        const deletedCount = getRecords().length;
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const response = await client
            .from(config.recordsTable)
            .delete()
            .gt("id", 0);

        if (response.error) {
            throw response.error;
        }

        clearCachedRecords();
        return { deleted: deletedCount };
    }

    async function importBackupRecords() {
        if (!isCloudEnabled()) {
            throw new Error("Enable Supabase mode before importing local browser records.");
        }

        await initialize();
        const backupRecords = getBackupRecords();
        if (!backupRecords.length) {
            return {
                imported: 0,
                skipped: 0,
                backupCount: 0
            };
        }

        const existingRecords = getRecords();
        const existingFingerprints = new Set(existingRecords.map(buildRecordFingerprint));
        const importQueue = [];
        let skipped = 0;

        backupRecords.forEach(function (record) {
            const payload = safeClone(record || {});
            delete payload.id;
            const fingerprint = buildRecordFingerprint(payload);
            if (existingFingerprints.has(fingerprint)) {
                skipped += 1;
                return;
            }
            existingFingerprints.add(fingerprint);
            importQueue.push(payload);
        });

        if (!importQueue.length) {
            return {
                imported: 0,
                skipped: skipped,
                backupCount: backupRecords.length
            };
        }

        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const batchSize = 100;
        let imported = 0;

        for (let index = 0; index < importQueue.length; index += batchSize) {
            const batch = importQueue.slice(index, index + batchSize).map(function (record) {
                return { record: record };
            });

            const response = await client
                .from(config.recordsTable)
                .insert(batch);

            if (response.error) {
                throw response.error;
            }

            imported += batch.length;
        }

        await refreshRecords({ dispatch: true });

        return {
            imported: imported,
            skipped: skipped,
            backupCount: backupRecords.length
        };
    }

    async function getRecordAuditLogs(recordId, limit) {
        if (recordId == null || recordId === "") {
            return [];
        }

        if (!isCloudEnabled()) {
            return [];
        }

        await initialize();
        const client = await window.lbSupabase.getClient();
        const config = getConfig();
        const maxRows = Math.max(1, Math.min(Number(limit) || 20, 100));
        const response = await client
            .from(config.auditTable)
            .select("id, record_id, action, actor_user_id, actor_email, action_at")
            .eq("record_id", recordId)
            .order("action_at", { ascending: false })
            .limit(maxRows);

        if (response.error) {
            throw response.error;
        }

        return Array.isArray(response.data)
            ? safeClone(response.data)
            : [];
    }

    function clearCache() {
        cachedRecords = [];
        if (isCloudEnabled()) {
            clearLegacyRecordStorage();
        } else {
            try {
                localStorage.removeItem(RECORDS_STORAGE_KEY);
            } catch (err) {
                console.warn("Failed to clear the local records cache.", err);
            }
        }

        dispatchRecordsChanged();
    }

    window.addEventListener("focus", function () {
        if (!isCloudEnabled()) return;
        if (!(window.lbAuth && window.lbAuth.isAuthenticated && window.lbAuth.isAuthenticated())) return;
        refreshRecords({ dispatch: true }).catch(function (err) {
            console.warn("Focused refresh failed.", err);
        });
    });

    window.addEventListener("storage", function (event) {
        if (event.key !== RECORDS_STORAGE_KEY) return;
        if (isCloudEnabled()) return;
        setCachedRecords(readLocalRecords(), true);
    });

    backupLegacyRecordsIfNeeded();

    window.lbData = {
        backupLegacyRecordsIfNeeded: backupLegacyRecordsIfNeeded,
        clearCache: clearCache,
        clearBackup: clearBackup,
        clearAllRecords: clearAllRecords,
        createRecord: createRecord,
        createRecords: createRecords,
        deleteRecord: deleteRecord,
        explainError: explainError,
        getBackupInfo: getBackupInfo,
        getBackupRecords: getBackupRecords,
        getLastError: getLastError,
        getRecordAuditLogs: getRecordAuditLogs,
        getRecords: getRecords,
        importBackupRecords: importBackupRecords,
        initialize: initialize,
        isCloudEnabled: isCloudEnabled,
        refreshRecords: refreshRecords,
        updateRecord: updateRecord,
        updateRecords: updateRecords
    };
})();
