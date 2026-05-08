import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ATTACHMENTS_BUCKET = Deno.env.get("ATTACHMENTS_BUCKET") || "record-attachments";
const ATTACHMENTS_TABLE = Deno.env.get("ATTACHMENTS_TABLE") || "record_attachments";
const RECORDS_TABLE = Deno.env.get("RECORDS_TABLE") || "lb_records";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

type AttachmentRow = {
  id: number;
  record_id: number | null;
  history_entry_id: string | null;
  storage_path: string;
  status: string;
  expires_at: string | null;
};

type RecordRow = {
  id: number;
  record: Record<string, unknown> | null;
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    ...init,
  });
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeMeta(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const meta = value as Record<string, unknown>;
  const attachmentId = normalizeText(meta.attachmentId || meta.id);
  const storagePath = normalizeText(meta.storagePath || meta.storage_path);
  return attachmentId || storagePath
    ? { attachmentId, storagePath }
    : null;
}

function readHistoryEntries(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!payload) return [];
  return Array.isArray(payload.history)
    ? payload.history.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[]
    : [];
}

function isMetaMatch(meta: unknown, row: AttachmentRow): boolean {
  const normalized = normalizeMeta(meta);
  if (!normalized) return false;
  if (normalized.attachmentId && normalized.attachmentId === String(row.id)) {
    return true;
  }
  return !!(normalized.storagePath && normalized.storagePath === row.storage_path);
}

function isAttachmentReferenced(row: AttachmentRow, recordRow: RecordRow | null): boolean {
  if (!recordRow || !recordRow.record || typeof recordRow.record !== "object") {
    return false;
  }

  const payload = recordRow.record;
  const history = readHistoryEntries(payload);
  if (row.history_entry_id) {
    const targetEntry = history.find((entry) => {
      const entryId = normalizeText(entry.id || entry.history_entry_id);
      return entryId && entryId === normalizeText(row.history_entry_id);
    });
    if (!targetEntry) {
      return false;
    }
    return isMetaMatch(targetEntry.upload_letter_meta, row);
  }

  if (isMetaMatch(payload.upload_letter_meta, row)) {
    return true;
  }

  return history.some((entry) => isMetaMatch(entry.upload_letter_meta, row));
}

function findReferencingRecord(row: AttachmentRow, records: RecordRow[]): RecordRow | null {
  for (const record of records) {
    if (isAttachmentReferenced(row, record)) {
      return record;
    }
  }
  return null;
}

async function fetchAllAttachments(client: ReturnType<typeof createClient>) {
  const rows: AttachmentRow[] = [];
  let lastId = 0;

  while (true) {
    const response = await client
      .from(ATTACHMENTS_TABLE)
      .select("id, record_id, history_entry_id, storage_path, status, expires_at")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(200);

    if (response.error) {
      throw response.error;
    }

    const batch = (response.data || []) as AttachmentRow[];
    if (!batch.length) {
      break;
    }

    rows.push(...batch);
    lastId = Number(batch[batch.length - 1].id || 0);
  }

  return rows;
}

async function fetchRecordMap(
  client: ReturnType<typeof createClient>,
  recordIds: number[],
) {
  const uniqueRecordIds = Array.from(new Set(recordIds.filter((id) => Number.isFinite(id))));
  const map = new Map<number, RecordRow>();

  for (let index = 0; index < uniqueRecordIds.length; index += 100) {
    const chunk = uniqueRecordIds.slice(index, index + 100);
    const response = await client
      .from(RECORDS_TABLE)
      .select("id, record")
      .in("id", chunk);

    if (response.error) {
      throw response.error;
    }

    (response.data || []).forEach((row) => {
      map.set(Number(row.id), row as RecordRow);
    });
  }

  return map;
}

async function fetchAllRecords(client: ReturnType<typeof createClient>) {
  const rows: RecordRow[] = [];
  let lastId = 0;

  while (true) {
    const response = await client
      .from(RECORDS_TABLE)
      .select("id, record")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(200);

    if (response.error) {
      throw response.error;
    }

    const batch = (response.data || []) as RecordRow[];
    if (!batch.length) {
      break;
    }

    rows.push(...batch);
    lastId = Number(batch[batch.length - 1].id || 0);
  }

  return rows;
}

async function removeObjects(
  client: ReturnType<typeof createClient>,
  storagePaths: string[],
) {
  const queue = storagePaths.filter(Boolean);
  let removed = 0;

  for (let index = 0; index < queue.length; index += 100) {
    const chunk = queue.slice(index, index + 100);
    const response = await client.storage.from(ATTACHMENTS_BUCKET).remove(chunk);
    if (response.error) {
      throw response.error;
    }
    removed += chunk.length;
  }

  return removed;
}

async function deleteAttachmentRows(
  client: ReturnType<typeof createClient>,
  ids: number[],
) {
  const queue = ids.filter((id) => Number.isFinite(id));
  let deleted = 0;

  for (let index = 0; index < queue.length; index += 100) {
    const chunk = queue.slice(index, index + 100);
    const response = await client
      .from(ATTACHMENTS_TABLE)
      .delete()
      .in("id", chunk);

    if (response.error) {
      throw response.error;
    }
    deleted += chunk.length;
  }

  return deleted;
}

async function promoteActiveRows(
  client: ReturnType<typeof createClient>,
  rows: AttachmentRow[],
) {
  let promoted = 0;

  for (const row of rows) {
    const response = await client
      .from(ATTACHMENTS_TABLE)
      .update({
        expires_at: null,
        record_id: row.record_id,
        status: "active",
      })
      .eq("id", row.id);

    if (response.error) {
      throw response.error;
    }

    promoted += 1;
  }

  return promoted;
}

Deno.serve(async (request) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  if (request.method !== "POST") {
    return json({ error: "Use POST for this cleanup function." }, { status: 405 });
  }

  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: "Unauthorized cleanup request." }, { status: 401 });
  }

  try {
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const attachments = await fetchAllAttachments(client);
    const recordMap = await fetchRecordMap(
      client,
      attachments
        .map((row) => Number(row.record_id))
        .filter((id) => Number.isFinite(id)),
    );
    const allRecords = attachments.some((row) => row.record_id == null)
      ? await fetchAllRecords(client)
      : [];

    const now = Date.now();
    const rowsToPromote: AttachmentRow[] = [];
    const rowsToDelete: AttachmentRow[] = [];

    attachments.forEach((row) => {
      const recordRow = row.record_id != null
        ? recordMap.get(Number(row.record_id)) || null
        : findReferencingRecord(row, allRecords);
      const referenced = isAttachmentReferenced(row, recordRow);
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      const isExpired = !expiresAt || expiresAt <= now;

      if (referenced) {
        if (row.status !== "active" || row.record_id == null) {
          rowsToPromote.push({
            ...row,
            record_id: recordRow ? Number(recordRow.id) : row.record_id,
          });
        }
        return;
      }

      if (row.status === "active" || isExpired) {
        rowsToDelete.push(row);
      }
    });

    const promoted = await promoteActiveRows(client, rowsToPromote);
    const removedObjects = await removeObjects(
      client,
      rowsToDelete.map((row) => row.storage_path),
    );
    const deletedRows = await deleteAttachmentRows(
      client,
      rowsToDelete.map((row) => Number(row.id)),
    );

    return json({
      deletedAttachmentRows: deletedRows,
      promotedActiveRows: promoted,
      removedObjects: removedObjects,
      scannedAttachments: attachments.length,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
