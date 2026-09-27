import { describe, expect, it, vi } from "vitest";

import { processComplianceStoragePurgeQueueImpl as processComplianceStoragePurgeQueue } from "@/lib/compliance/process-storage-purge-queue.impl";

type QueueRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  attempt_count: number;
};

function buildMockAdmin(options: {
  rows: QueueRow[];
  removeResult: { error: { message: string } | null; data?: unknown };
}) {
  const updates: { id: string; payload: Record<string, unknown> }[] = [];
  const remove = vi.fn().mockResolvedValue(options.removeResult);

  const admin = {
    from: (table: string) => {
      if (table !== "compliance_storage_purge_queue") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          is: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: options.rows,
                  error: null,
                }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            is: (_col2: string, _val: null) => {
              if ("purged_at" in payload) {
                updates.push({ id, payload });
                return {
                  select: () =>
                    Promise.resolve({
                      data: [{ id }],
                      error: null,
                    }),
                };
              }
              updates.push({ id, payload });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => remove(bucket, paths),
      }),
    },
  };

  return { admin, remove, updates };
}

describe("processComplianceStoragePurgeQueue", () => {
  it("calls storage.from(bucket).remove([path]) and marks row purged on success", async () => {
    const row: QueueRow = {
      id: "q1",
      bucket_id: "vehicle-docs",
      storage_path: "org/drivers/x/file.jpg",
      attempt_count: 0,
    };
    const { admin, remove, updates } = buildMockAdmin({
      rows: [row],
      removeResult: { error: null, data: [] },
    });

    const stats = await processComplianceStoragePurgeQueue(
      admin as unknown as import("@supabase/supabase-js").SupabaseClient
    );

    expect(remove).toHaveBeenCalledWith("vehicle-docs", [row.storage_path]);
    expect(stats).toEqual({ processed: 1, removed: 1, failed: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload.purged_at).toBeTruthy();
    expect(updates[0]?.payload.last_error).toBeNull();
  });

  it("keeps row pending with incremented attempts when remove fails", async () => {
    const row: QueueRow = {
      id: "q2",
      bucket_id: "vehicle-docs",
      storage_path: "org/drivers/y/file.jpg",
      attempt_count: 2,
    };
    const { admin, updates } = buildMockAdmin({
      rows: [row],
      removeResult: { error: { message: "storage_down" } },
    });

    const stats = await processComplianceStoragePurgeQueue(
      admin as unknown as import("@supabase/supabase-js").SupabaseClient
    );

    expect(stats).toEqual({ processed: 1, removed: 0, failed: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload.purged_at).toBeUndefined();
    expect(updates[0]?.payload.last_error).toBe("storage_down");
    expect(updates[0]?.payload.attempt_count).toBe(3);
  });

  it("marks row purged when remove succeeds with empty data (object already absent)", async () => {
    const row: QueueRow = {
      id: "q3",
      bucket_id: "vehicle-docs",
      storage_path: "org/drivers/z/gone.jpg",
      attempt_count: 0,
    };
    const { admin, updates } = buildMockAdmin({
      rows: [row],
      removeResult: { error: null, data: [] },
    });

    const stats = await processComplianceStoragePurgeQueue(
      admin as unknown as import("@supabase/supabase-js").SupabaseClient
    );

    expect(stats).toEqual({ processed: 1, removed: 1, failed: 0 });
    expect(updates[0]?.payload.purged_at).toBeTruthy();
  });
});
