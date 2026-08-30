import { createClient } from "@/lib/supabase/client";
import type { VehicleDocType } from "@/lib/constants";
import { writeAuditLog } from "@/services/audit.service";
import type { VehicleDocument } from "@/types";

const TABLE = "vehicle_documents";
export const VEHICLE_DOCS_BUCKET = "vehicle-docs";

export async function listVehicleDocuments(
  organisationId: string,
  vehicleId: string
): Promise<VehicleDocument[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VehicleDocument[];
}

export async function createVehicleDocument(input: {
  organisationId: string;
  vehicleId: string;
  name: string;
  docType: VehicleDocType;
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
}): Promise<VehicleDocument> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organisation_id: input.organisationId,
      vehicle_id: input.vehicleId,
      name: input.name,
      doc_type: input.docType,
      storage_path: input.storagePath ?? null,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType ?? null,
      expires_at: input.expiresAt ?? null,
      notes: input.notes ?? null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: input.organisationId,
      action: "vehicle_document.created",
      entityType: "vehicle_document",
      entityId: data.id,
      metadata: { vehicle_id: input.vehicleId },
    });
  } catch {
    // best-effort
  }

  return data as VehicleDocument;
}

export async function softDeleteVehicleDocument(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function uploadVehicleDocumentFile(input: {
  organisationId: string;
  vehicleId: string;
  file: File;
}): Promise<{ storagePath: string; fileName: string; mimeType: string }> {
  const supabase = createClient();
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${input.organisationId}/${input.vehicleId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(VEHICLE_DOCS_BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type || undefined,
      upsert: false,
    });

  if (error) throw error;

  return {
    storagePath,
    fileName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
  };
}

export async function getVehicleDocumentSignedUrl(
  storagePath: string
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(VEHICLE_DOCS_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}
