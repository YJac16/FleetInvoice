import type { NormalisedEvidence } from "@/lib/compliance/evidence";

export type ScanFieldSuggestion = {
  value: string;
  confidence: number;
  evidence: NormalisedEvidence | unknown;
};

export type ScanExtractResult = {
  fields: Record<string, ScanFieldSuggestion>;
  warnings: string[];
};

const SPECIMEN_BBOX: NormalisedEvidence = {
  page: 0,
  bbox: [0.1, 0.2, 0.5, 0.15],
};

export async function mockExtractCompliance(
  docType: string,
  _bytes: Uint8Array,
  options?: { injectTextEvidence?: boolean }
): Promise<ScanExtractResult> {
  const textEvidence = options?.injectTextEvidence
    ? "ID 8001015009087"
    : SPECIMEN_BBOX;

  const base = {
    confidence: 0.92,
    evidence: textEvidence,
  };

  switch (docType) {
    case "driver_licence":
      return {
        fields: {
          license_number: { value: "SPECIMEN-LIC-001", ...base },
          license_code: { value: "B", ...base },
          license_valid_to: { value: "2030-12-31", ...base },
          id_number: { value: "SHOULD_STRIP", confidence: 0.5, evidence: null },
        },
        warnings: [],
      };
    case "prdp":
      return {
        fields: {
          pdp_number: { value: "SPECIMEN-PRDP-001", ...base },
          pdp_categories: { value: "G,P", confidence: 0.7, evidence: null },
          pdp_valid_to: { value: "2030-06-30", ...base },
        },
        warnings: [],
      };
    case "license_disk":
    case "vehicle_disc":
      return {
        fields: {
          registration_number: { value: "CA123456", ...base },
          license_disc_expires_on: { value: "2030-03-31", ...base },
        },
        warnings: [],
      };
    case "operating_permit":
      return {
        fields: {
          operating_permit_number: { value: "OP-SPEC-001", ...base },
          operating_permit_expires_on: { value: "2030-04-30", ...base },
          registration_number: { value: "CA123456", ...base },
        },
        warnings: [],
      };
    case "registration_certificate":
      return {
        fields: {
          registration_number: { value: "CA123456", ...base },
        },
        warnings: [],
      };
    default:
      return { fields: {}, warnings: ["unknown_doc_type"] };
  }
}
