/** NaTIS registration certificate — scan-and-discard only; no retained blob. */
export const REGISTRATION_CERTIFICATE_DOC_TYPE = "registration_certificate";

export const RC_ALLOWED_SCAN_FIELD_KEYS = [
  "registration_number",
  "make",
  "model",
  "model_year",
  "license_disc_expires_on",
] as const;

/** Owner PII from RC must never be suggested or persisted. */
export const RC_FORBIDDEN_SCAN_FIELD_KEYS = [
  "owner_name",
  "owner_id_number",
  "owner_address",
  "owner_surname",
  "owner_first_name",
] as const;

export function isRegistrationCertificateDocType(docType: string): boolean {
  return docType === REGISTRATION_CERTIFICATE_DOC_TYPE;
}

export function rcPermanentStorageForbidden(
  docType: string,
  storageMode: "retained" | "scan_discard"
): boolean {
  return isRegistrationCertificateDocType(docType) && storageMode === "retained";
}
