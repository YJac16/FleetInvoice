export type ScanSubjectKind =
  | "driver_licence"
  | "prdp"
  | "vehicle_disc"
  | "operating_permit"
  | "registration_certificate";

export type ScanFieldMapping = {
  scanKey: string;
  formKey: string;
  label: string;
};

export const SCAN_FIELD_MAP: Record<ScanSubjectKind, ScanFieldMapping[]> = {
  driver_licence: [
    { scanKey: "license_number", formKey: "license_number", label: "Licence number" },
    { scanKey: "license_code", formKey: "license_code", label: "Licence code" },
    { scanKey: "license_valid_to", formKey: "license_expires_on", label: "Licence expires" },
  ],
  prdp: [
    { scanKey: "pdp_number", formKey: "pdp_number", label: "PrDP number" },
    { scanKey: "pdp_valid_to", formKey: "pdp_expires_on", label: "PrDP expires" },
  ],
  vehicle_disc: [
    { scanKey: "registration_number", formKey: "registration_number", label: "Registration" },
    {
      scanKey: "license_disc_expires_on",
      formKey: "license_disc_expires_on",
      label: "Licence disc expiry",
    },
  ],
  operating_permit: [
    {
      scanKey: "operating_permit_number",
      formKey: "operating_permit_number",
      label: "Operating permit number",
    },
    {
      scanKey: "operating_permit_expires_on",
      formKey: "operating_permit_expires_on",
      label: "Operating permit expiry",
    },
    { scanKey: "registration_number", formKey: "registration_number", label: "Registration" },
  ],
  registration_certificate: [
    { scanKey: "registration_number", formKey: "registration_number", label: "Registration" },
  ],
};

export function docTypeToScanSubject(
  subjectKind: "driver" | "vehicle",
  docType: string
): ScanSubjectKind {
  if (subjectKind === "driver") {
    return docType === "prdp" ? "prdp" : "driver_licence";
  }
  if (docType === "license_disk") return "vehicle_disc";
  if (docType === "operating_permit") return "operating_permit";
  return "registration_certificate";
}
