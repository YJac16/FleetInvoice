import { detectComplianceMime } from "@/lib/compliance/file-validation";

/** Private bucket created in 00075. Service role only; no client policies. */
export const WORKSHOP_BILLS_BUCKET = "workshop-bills";

/** Must match the bucket limit and workshop_bills_attachment_size_check. */
export const WORKSHOP_BILL_MAX_BYTES = 10 * 1024 * 1024;

/** Signed URL lifetime for viewing a bill attachment. */
export const WORKSHOP_BILL_VIEW_URL_SECONDS = 60;

export const WORKSHOP_BILL_ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type WorkshopBillMime = (typeof WORKSHOP_BILL_ALLOWED_MIMES)[number];

const EXT: Record<WorkshopBillMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function workshopBillExt(mime: WorkshopBillMime): string {
  return EXT[mime];
}

export function buildWorkshopBillPath(input: {
  organisationId: string;
  billId: string;
  objectId: string;
  mime: WorkshopBillMime;
}): string {
  return `${input.organisationId}/${input.billId}/${input.objectId}.${workshopBillExt(input.mime)}`;
}

function isAllowedMime(value: string): value is WorkshopBillMime {
  return (WORKSHOP_BILL_ALLOWED_MIMES as readonly string[]).includes(value);
}

/**
 * Server-side check of an uploaded bill. The type comes from the file's
 * bytes; a declared type, if sent, must be allowed and agree with them.
 */
export function validateWorkshopBillFile(input: {
  bytes: Uint8Array;
  declaredMime?: string | null;
}):
  | { ok: true; mime: WorkshopBillMime }
  | { ok: false; code: "empty_file" | "file_too_large" | "unsupported_media_type"; status: 400 | 413 | 415 } {
  if (input.bytes.length === 0) return { ok: false, code: "empty_file", status: 400 };
  if (input.bytes.length > WORKSHOP_BILL_MAX_BYTES) {
    return { ok: false, code: "file_too_large", status: 413 };
  }

  const declared = (input.declaredMime ?? "").toLowerCase().trim();
  if (declared && declared !== "application/octet-stream" && !isAllowedMime(declared)) {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }

  const detected = detectComplianceMime(input.bytes);
  if (!detected || detected === "heic" || !isAllowedMime(detected)) {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }
  if (isAllowedMime(declared) && declared !== detected) {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }

  return { ok: true, mime: detected };
}
