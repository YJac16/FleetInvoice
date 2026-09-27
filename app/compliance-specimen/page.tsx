"use client";

import { ComplianceDocumentSection } from "@/features/compliance/components/compliance-document-section";
import {
  ComplianceScanReviewDialog,
  type ScanSuggestion,
} from "@/features/compliance/components/compliance-scan-review-dialog";

const SPECIMEN_SUGGESTIONS: Record<string, ScanSuggestion> = {
  license_number: {
    value: "SPECIMEN-LIC-001",
    confidence: 0.92,
    evidence: { page: 0, bbox: [0.12, 0.22, 0.55, 0.12] },
  },
  license_code: { value: "B", confidence: 0.88, evidence: { page: 0, bbox: [0.12, 0.4, 0.2, 0.08] } },
  license_valid_to: {
    value: "2030-12-31",
    confidence: 0.91,
    evidence: { page: 0, bbox: [0.12, 0.55, 0.35, 0.08] },
  },
};

/** Static specimen preview for docs/screenshots (Cape Shuttle Ops synthetic). */
export default function ComplianceSpecimenPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Cape Shuttle Ops · SPECIMEN</p>
        <h1 className="text-xl font-semibold">Compliance upload & scan review (preview)</h1>
      </header>

      <ComplianceDocumentSection
        subjectKind="driver"
        subjectId="a0000000-0000-4000-8000-000000000201"
        docType="driver_licence"
        label="Driver licence document"
        scanEnabled
        onApplyScanFields={() => undefined}
      />

      <ComplianceScanReviewDialog
        open
        onOpenChange={() => undefined}
        previewUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='240'%3E%3Crect fill='%23e5e7eb' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%236b7280' font-size='14'%3ESPECIMEN licence image%3C/text%3E%3C/svg%3E"
        fieldMappings={[
          { scanKey: "license_number", formKey: "license_number", label: "Licence number" },
          { scanKey: "license_code", formKey: "license_code", label: "Licence code" },
          { scanKey: "license_valid_to", formKey: "license_expires_on", label: "Licence expires" },
        ]}
        suggestions={SPECIMEN_SUGGESTIONS}
        warnings={[]}
        onApply={() => undefined}
      />
    </div>
  );
}
