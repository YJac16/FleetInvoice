import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "vehicle-docs";
const BATCH_SIZE = 50;

type PurgeRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  attempt_count: number;
};

export type StoragePurgeQueueStats = {
  processed: number;
  removed: number;
  failed: number;
};

/**
 * Drains compliance_storage_purge_queue via Supabase Storage API (hosted-safe).
 * Call only with a server-side service-role Supabase client.
 */
export async function processComplianceStoragePurgeQueueImpl(
  admin: SupabaseClient,
  limit = BATCH_SIZE
): Promise<StoragePurgeQueueStats> {
  const { data: rows, error: fetchError } = await admin
    .from("compliance_storage_purge_queue")
    .select("id, bucket_id, storage_path, attempt_count")
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

  for (const row of pending) {
    const bucket = row.bucket_id || DEFAULT_BUCKET;
    const { data: removeData, error: removeError } = await admin.storage
      .from(bucket)
      .remove([row.storage_path]);

    // Storage API: error set, or data null (failed call). Empty data[] is success (incl. already-deleted objects).
    if (removeError || removeData === null) {
      failed += 1;
      const { error: updateError } = await admin
        .from("compliance_storage_purge_queue")
        .update({
          last_error: removeError?.message ?? "storage_remove_no_data",
          attempt_count: (row.attempt_count ?? 0) + 1,
        })
        .eq("id", row.id)
        .is("purged_at", null);

      if (updateError) {
        throw updateError;
      }
      continue;
    }

    const purgedAt = new Date().toISOString();
    const { data: updated, error: markError } = await admin
      .from("compliance_storage_purge_queue")
      .update({ purged_at: purgedAt, last_error: null })
      .eq("id", row.id)
      .is("purged_at", null)
      .select("id");

    if (markError) {
      throw markError;
    }

    if (updated && updated.length > 0) {
      removed += 1;
    }
  }

  return { processed: pending.length, removed, failed };
}
