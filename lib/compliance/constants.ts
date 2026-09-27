export const COMPLIANCE_MAX_BYTES = 10 * 1024 * 1024;
export const COMPLIANCE_MAX_PDF_PAGES = 5;
export const COMPLIANCE_VIEW_URL_SECONDS = 60;
export const COMPLIANCE_SCAN_QUOTA_CAP = 100;

export const COMPLIANCE_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type ComplianceAllowedMime = (typeof COMPLIANCE_ALLOWED_MIMES)[number];

export const COMPLIANCE_VEHICLE_DOC_TYPES = [
  "license_disk",
  "operating_permit",
  "registration_certificate",
] as const;

export const COMPLIANCE_DRIVER_DOC_TYPES = ["driver_licence", "prdp"] as const;
