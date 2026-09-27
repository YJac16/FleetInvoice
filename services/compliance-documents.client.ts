import { createClient } from "@/lib/supabase/client";

export type CurrentComplianceDocument = {
  id: string;
  mime_type: string;
  file_name: string | null;
  created_at: string;
  kind: "driver" | "vehicle";
};

export async function fetchCurrentComplianceDocument(input: {
  subjectKind: "driver" | "vehicle";
  subjectId: string;
  docType: string;
  side: string;
}): Promise<CurrentComplianceDocument | null> {
  const supabase = createClient();
  if (input.subjectKind === "driver") {
    const { data, error } = await supabase
      .from("driver_documents")
      .select("id, mime_type, file_name, created_at")
      .eq("driver_id", input.subjectId)
      .eq("doc_type", input.docType)
      .eq("side", input.side)
      .eq("is_current", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return { ...data, kind: "driver" };
  }

  const { data, error } = await supabase
    .from("vehicle_documents")
    .select("id, mime_type, file_name, created_at")
    .eq("vehicle_id", input.subjectId)
    .eq("doc_type", input.docType)
    .eq("side", input.side)
    .eq("is_current", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, kind: "vehicle" };
}

export async function deleteComplianceDocument(documentId: string): Promise<void> {
  const res = await fetch(`/api/compliance/documents/${documentId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "delete_failed");
  }
}
