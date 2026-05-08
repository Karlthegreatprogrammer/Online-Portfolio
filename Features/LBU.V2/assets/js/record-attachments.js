(function () {
    "use strict";

    const DEFAULT_BUCKET = "record-attachments";
    const DEFAULT_TABLE = "record_attachments";
    const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
    const DEFAULT_TEMP_TTL_HOURS = 24;
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const MAX_PDF_BYTES = 15 * 1024 * 1024;
    const ALLOWED_EXTENSION_TO_MIME = Object.freeze({
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp"
    });

    function getConfig() {
        const config = window.LBU_SUPABASE_CONFIG || {};
        return {
            bucket: String(config.attachmentsBucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET,
            enabled: !!(config.enabled && config.url && config.anonKey),
            signedUrlTtlSeconds: Number(config.attachmentSignedUrlTtl || DEFAULT_SIGNED_URL_TTL_SECONDS) || DEFAULT_SIGNED_URL_TTL_SECONDS,
            table: String(config.attachmentsTable || DEFAULT_TABLE).trim() || DEFAULT_TABLE,
            tempTtlHours: Number(config.attachmentTempTtlHours || DEFAULT_TEMP_TTL_HOURS) || DEFAULT_TEMP_TTL_HOURS
        };
    }

    function isSupported() {
        return !!(
            getConfig().enabled &&
            window.lbSupabase &&
            typeof window.lbSupabase.getClient === "function" &&
            window.lbSupabase.isEnabled &&
            window.lbSupabase.isEnabled()
        );
    }

    function normalizeMeta(meta) {
        if (!meta) return null;
        if (typeof meta === "string") {
            const trimmed = meta.trim();
            return trimmed ? {
                attachmentId: "",
                historyEntryId: "",
                lastModified: null,
                name: trimmed,
                size: null,
                status: "",
                storagePath: "",
                type: "",
                uploadedAt: "",
                uploadedBy: ""
            } : null;
        }
        if (typeof meta !== "object") return null;

        const normalized = {
            attachmentId: String(meta.attachmentId || meta.id || "").trim(),
            historyEntryId: String(meta.historyEntryId || meta.history_entry_id || "").trim(),
            lastModified: meta.lastModified != null && Number.isFinite(Number(meta.lastModified))
                ? Number(meta.lastModified)
                : null,
            name: String(meta.name || meta.original_name || meta.fileName || "").trim(),
            size: meta.size != null && Number.isFinite(Number(meta.size))
                ? Number(meta.size)
                : (meta.size_bytes != null && Number.isFinite(Number(meta.size_bytes)) ? Number(meta.size_bytes) : null),
            status: String(meta.status || "").trim(),
            storagePath: String(meta.storagePath || meta.storage_path || "").trim(),
            type: String(meta.type || meta.mime_type || "").trim(),
            uploadedAt: String(meta.uploadedAt || meta.uploaded_at || "").trim(),
            uploadedBy: String(meta.uploadedBy || meta.uploaded_by || "").trim()
        };

        return normalized.name ||
            normalized.attachmentId ||
            normalized.storagePath ||
            normalized.type ||
            normalized.size != null ||
            normalized.lastModified != null ||
            normalized.status ||
            normalized.historyEntryId ||
            normalized.uploadedAt ||
            normalized.uploadedBy
            ? normalized
            : null;
    }

    function getAttachmentId(meta) {
        const normalized = normalizeMeta(meta);
        return normalized ? normalized.attachmentId : "";
    }

    function getStoragePath(meta) {
        const normalized = normalizeMeta(meta);
        return normalized ? normalized.storagePath : "";
    }

    function getHistoryEntryId(meta) {
        const normalized = normalizeMeta(meta);
        return normalized ? normalized.historyEntryId : "";
    }

    function getFileExtension(name) {
        const fileName = String(name || "").trim();
        const dotIndex = fileName.lastIndexOf(".");
        return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
    }

    function getMaxSizeBytes(extension) {
        return extension === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    }

    function formatSizeLimit(bytes) {
        return bytes >= 1024 * 1024
            ? `${Math.round(bytes / (1024 * 1024))} MB`
            : `${Math.round(bytes / 1024)} KB`;
    }

    function sanitizeFileName(name) {
        const base = String(name || "attachment").trim();
        return (base || "attachment")
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            || "attachment";
    }

    function generateToken(prefix) {
        return [
            String(prefix || "att").trim() || "att",
            Date.now().toString(36),
            Math.random().toString(36).slice(2, 10)
        ].join("_");
    }

    function generateHistoryEntryId() {
        return generateToken("hist");
    }

    function inferMimeType(file) {
        const extension = getFileExtension(file && file.name);
        const declaredType = String(file && file.type || "").trim().toLowerCase();

        if (declaredType === "image/jpg") {
            return "image/jpeg";
        }
        if (ALLOWED_EXTENSION_TO_MIME[extension]) {
            return ALLOWED_EXTENSION_TO_MIME[extension];
        }
        return declaredType;
    }

    function validateFile(file) {
        if (!file) {
            return {
                error: "Select a file to upload.",
                valid: false
            };
        }

        const extension = getFileExtension(file.name);
        const mimeType = inferMimeType(file);
        const expectedMimeType = ALLOWED_EXTENSION_TO_MIME[extension];

        if (!expectedMimeType) {
            return {
                error: "Only PDF, JPG, JPEG, PNG, and WEBP files are allowed.",
                valid: false
            };
        }

        if (mimeType && expectedMimeType && mimeType !== expectedMimeType) {
            return {
                error: "The selected file type does not match its extension. Please choose a valid PDF or image file.",
                valid: false
            };
        }

        const maxSizeBytes = getMaxSizeBytes(extension);
        const fileSize = Number(file.size || 0);
        if (fileSize > maxSizeBytes) {
            return {
                error: extension === "pdf"
                    ? `PDF files must be ${formatSizeLimit(MAX_PDF_BYTES)} or smaller.`
                    : `Image files must be ${formatSizeLimit(MAX_IMAGE_BYTES)} or smaller.`,
                maxSizeBytes: maxSizeBytes,
                mimeType: expectedMimeType,
                valid: false
            };
        }

        return {
            extension: extension,
            maxSizeBytes: maxSizeBytes,
            mimeType: expectedMimeType,
            valid: true
        };
    }

    function rowToMeta(row, fallback) {
        const normalizedFallback = normalizeMeta(fallback);
        if (!row && !normalizedFallback) return null;

        return normalizeMeta({
            attachmentId: row && row.id != null ? String(row.id) : normalizedFallback && normalizedFallback.attachmentId,
            historyEntryId: row && row.history_entry_id != null ? row.history_entry_id : normalizedFallback && normalizedFallback.historyEntryId,
            lastModified: normalizedFallback && normalizedFallback.lastModified,
            name: row && row.original_name != null ? row.original_name : normalizedFallback && normalizedFallback.name,
            size: row && row.size_bytes != null ? row.size_bytes : normalizedFallback && normalizedFallback.size,
            status: row && row.status != null ? row.status : normalizedFallback && normalizedFallback.status,
            storagePath: row && row.storage_path != null ? row.storage_path : normalizedFallback && normalizedFallback.storagePath,
            type: row && row.mime_type != null ? row.mime_type : normalizedFallback && normalizedFallback.type,
            uploadedAt: row && row.uploaded_at != null ? row.uploaded_at : normalizedFallback && normalizedFallback.uploadedAt,
            uploadedBy: row && row.uploaded_by != null ? row.uploaded_by : normalizedFallback && normalizedFallback.uploadedBy
        });
    }

    async function getClient() {
        if (!isSupported()) {
            throw new Error("Supabase Storage is not enabled for attachments.");
        }
        const client = await window.lbSupabase.getClient();
        if (!client) {
            throw new Error("Supabase client is unavailable.");
        }
        return client;
    }

    async function getCurrentUserEmail(client) {
        const profile = window.lbAuth && typeof window.lbAuth.getCurrentAdminProfile === "function"
            ? window.lbAuth.getCurrentAdminProfile()
            : null;
        if (profile && profile.email) {
            return String(profile.email).trim().toLowerCase();
        }

        if (client.auth && typeof client.auth.getSession === "function") {
            const sessionResponse = await client.auth.getSession();
            if (sessionResponse && sessionResponse.error) {
                throw sessionResponse.error;
            }
            const email = sessionResponse &&
                sessionResponse.data &&
                sessionResponse.data.session &&
                sessionResponse.data.session.user &&
                sessionResponse.data.session.user.email;
            return String(email || "").trim().toLowerCase();
        }

        return "";
    }

    function createStoragePath(file, historyEntryId) {
        const datePart = new Date().toISOString().slice(0, 10);
        const safeName = sanitizeFileName(file && file.name);
        return [
            "history-entries",
            datePart,
            String(historyEntryId || generateHistoryEntryId()).trim(),
            `${generateToken("file")}-${safeName}`
        ].join("/");
    }

    async function safeRemoveObject(client, path) {
        const storagePath = String(path || "").trim();
        if (!storagePath) return;
        try {
            await client.storage.from(getConfig().bucket).remove([storagePath]);
        } catch (error) {
            console.warn("Failed to remove attachment from storage.", error);
        }
    }

    async function uploadFile(file, options) {
        const validation = validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const client = await getClient();
        const config = getConfig();
        const historyEntryId = String(options && options.historyEntryId || generateHistoryEntryId()).trim();
        const storagePath = createStoragePath(file, historyEntryId);
        const uploadedBy = await getCurrentUserEmail(client);
        const expiresAt = new Date(Date.now() + (config.tempTtlHours * 60 * 60 * 1000)).toISOString();

        const uploadResponse = await client.storage
            .from(config.bucket)
            .upload(storagePath, file, {
                cacheControl: "3600",
                contentType: validation.mimeType,
                upsert: false
            });

        if (uploadResponse.error) {
            throw uploadResponse.error;
        }

        try {
            const insertResponse = await client
                .from(config.table)
                .insert({
                    expires_at: expiresAt,
                    history_entry_id: historyEntryId,
                    mime_type: validation.mimeType,
                    original_name: String(file.name || "").trim(),
                    record_id: options && options.recordId != null ? Number(options.recordId) : null,
                    size_bytes: Number(file.size || 0),
                    status: options && options.recordId != null ? "active" : "temp",
                    storage_path: storagePath,
                    uploaded_by: uploadedBy || null
                })
                .select("id, storage_path, original_name, mime_type, size_bytes, record_id, history_entry_id, uploaded_at, uploaded_by, status, expires_at")
                .single();

            if (insertResponse.error) {
                throw insertResponse.error;
            }

            return rowToMeta(insertResponse.data, {
                historyEntryId: historyEntryId,
                lastModified: Number.isFinite(Number(file.lastModified)) ? Number(file.lastModified) : null
            });
        } catch (error) {
            await safeRemoveObject(client, storagePath);
            throw error;
        }
    }

    async function finalizeAttachment(meta, options) {
        const client = await getClient();
        const config = getConfig();
        const attachmentId = getAttachmentId(meta);
        const storagePath = getStoragePath(meta);
        const historyEntryId = String(options && options.historyEntryId || getHistoryEntryId(meta)).trim();
        const recordId = options && options.recordId != null ? Number(options.recordId) : null;

        if (!attachmentId && !storagePath) {
            return normalizeMeta(meta);
        }

        let query = client
            .from(config.table)
            .update({
                expires_at: null,
                history_entry_id: historyEntryId || null,
                record_id: recordId,
                status: "active"
            })
            .select("id, storage_path, original_name, mime_type, size_bytes, record_id, history_entry_id, uploaded_at, uploaded_by, status, expires_at")
            .single();

        query = attachmentId
            ? query.eq("id", Number(attachmentId))
            : query.eq("storage_path", storagePath);

        const response = await query;
        if (response.error) {
            throw response.error;
        }

        return rowToMeta(response.data, meta);
    }

    async function markAttachmentOrphan(meta, options) {
        const client = await getClient();
        const config = getConfig();
        const attachmentId = getAttachmentId(meta);
        const storagePath = getStoragePath(meta);
        const hours = Number(options && options.ttlHours || config.tempTtlHours) || config.tempTtlHours;
        const expiresAt = new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();

        if (!attachmentId && !storagePath) {
            return normalizeMeta(meta);
        }

        let query = client
            .from(config.table)
            .update({
                expires_at: expiresAt,
                status: "orphan"
            })
            .select("id, storage_path, original_name, mime_type, size_bytes, record_id, history_entry_id, uploaded_at, uploaded_by, status, expires_at")
            .single();

        query = attachmentId
            ? query.eq("id", Number(attachmentId))
            : query.eq("storage_path", storagePath);

        const response = await query;
        if (response.error) {
            throw response.error;
        }

        return rowToMeta(response.data, meta);
    }

    async function deleteAttachment(metaOrId) {
        const client = await getClient();
        const config = getConfig();
        const normalizedMeta = typeof metaOrId === "object"
            ? normalizeMeta(metaOrId)
            : normalizeMeta({ attachmentId: metaOrId });
        const attachmentId = normalizedMeta ? normalizedMeta.attachmentId : String(metaOrId || "").trim();
        const storagePath = normalizedMeta ? normalizedMeta.storagePath : "";

        if (!attachmentId && !storagePath) return;

        if (storagePath) {
            await safeRemoveObject(client, storagePath);
        }

        let query = client.from(config.table).delete();
        query = attachmentId
            ? query.eq("id", Number(attachmentId))
            : query.eq("storage_path", storagePath);

        const response = await query;
        if (response.error) {
            throw response.error;
        }
    }

    async function deleteAttachments(items) {
        const queue = Array.isArray(items) ? items.filter(Boolean) : [];
        for (let index = 0; index < queue.length; index += 1) {
            await deleteAttachment(queue[index]);
        }
    }

    async function clearAll() {
        const client = await getClient();
        const config = getConfig();
        let lastId = 0;

        while (true) {
            const response = await client
                .from(config.table)
                .select("id, storage_path")
                .gt("id", lastId)
                .order("id", { ascending: true })
                .limit(200);

            if (response.error) {
                throw response.error;
            }

            const rows = Array.isArray(response.data) ? response.data : [];
            if (!rows.length) {
                break;
            }

            await deleteAttachments(rows.map(function (row) {
                return rowToMeta(row);
            }));

            lastId = Number(rows[rows.length - 1].id || 0);
        }
    }

    async function createSignedUrl(meta, options) {
        const client = await getClient();
        const config = getConfig();
        const normalizedMeta = normalizeMeta(meta);
        const storagePath = normalizedMeta ? normalizedMeta.storagePath : "";
        if (!storagePath) {
            return "";
        }

        const ttl = Number(options && options.ttlSeconds || config.signedUrlTtlSeconds) || config.signedUrlTtlSeconds;
        const response = await client.storage
            .from(config.bucket)
            .createSignedUrl(storagePath, ttl);

        if (response.error) {
            throw response.error;
        }

        return response.data && response.data.signedUrl
            ? String(response.data.signedUrl)
            : "";
    }

    window.lbAttachments = {
        clearAll: clearAll,
        createSignedUrl: createSignedUrl,
        deleteAttachment: deleteAttachment,
        deleteAttachments: deleteAttachments,
        finalizeAttachment: finalizeAttachment,
        generateHistoryEntryId: generateHistoryEntryId,
        getAttachmentId: getAttachmentId,
        getHistoryEntryId: getHistoryEntryId,
        getStoragePath: getStoragePath,
        isSupported: isSupported,
        markAttachmentOrphan: markAttachmentOrphan,
        normalizeMeta: normalizeMeta,
        uploadFile: uploadFile,
        validateFile: validateFile
    };
})();
