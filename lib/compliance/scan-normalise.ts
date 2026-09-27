import { normaliseEvidence } from "@/lib/compliance/evidence";
import { RC_ALLOWED_SCAN_FIELD_KEYS } from "@/lib/compliance/rc-policy";
import type { ScanExtractResult } from "@/lib/compliance/scan/mock-provider";

const ALLOWED_KEYS: Record<string, string[]> = {
  driver_licence: ["license_number", "license_code", "license_valid_to"],
  prdp: ["pdp_number", "pdp_categories", "pdp_valid_to"],
  vehicle_disc: ["registration_number", "license_disc_expires_on"],
  license_disk: ["registration_number", "license_disc_expires_on"],
  operating_permit: [
    "operating_permit_number",
    "operating_permit_expires_on",
    "registration_number",
  ],
  registration_certificate: [...RC_ALLOWED_SCAN_FIELD_KEYS],
};

const LICENSE_CODES = new Set([
  "A1",
  "A",
  "B",
  "EB",
  "C1",
  "C",
  "EC1",
  "EC",
  "Other",
]);

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateInWindow(value: string): boolean {
  const d = parseDate(value);
  if (!d) return false;
  const today = new Date();
  const min = new Date(today);
  min.setFullYear(min.getFullYear() - 5);
  const max = new Date(today);
  max.setFullYear(max.getFullYear() + 15);
  return d >= min && d <= max;
}

export function normaliseScanResult(
  subjectKind: string,
  raw: ScanExtractResult,
  vehicleRegistration?: string | null
): ScanExtractResult {
  const allowed = ALLOWED_KEYS[subjectKind] ?? [];
  const fields: ScanExtractResult["fields"] = {};
  const warnings = [...raw.warnings];

  for (const [key, suggestion] of Object.entries(raw.fields)) {
    if (!allowed.includes(key)) continue;

    const { evidence, droppedText } = normaliseEvidence(suggestion.evidence);
    if (droppedText) warnings.push("evidence_text_dropped");

    let confidence = suggestion.confidence;
    const value = suggestion.value;
    let valid = true;

    if (key.endsWith("_valid_to") || key.endsWith("_expires_on")) {
      valid = dateInWindow(value);
    }
    if (key === "license_code") {
      valid = LICENSE_CODES.has(value);
    }
    if (key === "registration_number" && vehicleRegistration) {
      const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
      if (norm(value) !== norm(vehicleRegistration)) {
        warnings.push("registration_mismatch");
        confidence = Math.min(confidence, 0.6);
      }
    }

    if (!valid) {
      warnings.push(`invalid_${key}`);
      confidence = Math.min(confidence, 0.5);
    }

    fields[key] = {
      value,
      confidence,
      evidence,
    };
  }

  return { fields, warnings };
}
