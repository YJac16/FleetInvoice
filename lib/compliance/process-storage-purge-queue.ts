import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "vehicle-docs";
const BATCH_SIZE = 50;

type PurgeRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
};

/**
 * Drains compliance_storage_purge_queue via Supabase Storage API (hosted-safe).
 */
export async function processComplianceStoragePurgeQueue(
  admin: SupabaseClient,
  limit = BATCH_SIZE
): Promise<{ processed: number; removed: number; failed: number }> {
  const { data: rows, error: fetchError } = await admin
    .from("compliance_storage_purge_queue")
    .select("id, bucket_id, storage_path")
    .is("purged_at", null)
    .order("queued_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    throw fetchError;
  }

  const pending = (rows ?? []) as PurgeRow[];
  if (pending.length === 0) {
    return { processed: 0, removed: 0, failed: 0 };
  }

  let removed = 0;
  let failed = 0;

  const byBucket = new Map<string, PurgeRow[]>();
  for (const row of pending) {
    const bucket = row.bucket_id || DEFAULT_BUCKET;
    const list = byBucket.get(bucket) ?? [];
    list.push(row);
    byBucket.set(bucket, list);
  }

  for (const [bucket, bucketRows] of byBucket) {
    const paths = bucketRows.map((r) => r.storage_path);
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);

    if (removeError) {
      failed += bucketRows.length;
      const now = new Date().toISOString();
      for (const row of bucketRows) {
        await admin
          .from("compliance_storage_purge_queue")
          .update({ last_error: removeError.message, queued_at: now })
          .eq("id", row.id);
      }
      continue;
    }

    removed += bucketRows.length;
    const purgedAt = new Date().toISOString();
    for (const row of bucketRows) {
      await admin
        .from("compliance_storage_purge_queue")
        .update({ purged_at: purgedAt, last_error: null })
        .eq("id", row.id);
    }
  }

  return { processed: pending.length, removed, failed };
}
