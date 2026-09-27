"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { CaptureSection } from "@/features/compliance/components/capture-section";
import { ComplianceDocumentSection } from "@/features/compliance/components/compliance-document-section";
import { LICENSE_CODES } from "@/features/compliance/lib/compliance-status";
import { PRDP_SHORT_LABEL } from "@/features/compliance/lib/prdp-label";
import {
  driverSchema,
  type DriverValues,
} from "@/features/drivers/schemas/driver";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import type { Driver } from "@/types";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

const licenseCodeOptions = [
  { label: "Not set", value: "" },
  ...LICENSE_CODES.map((code) => ({ label: code, value: code })),
];

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function driverValuesToPayload(values: DriverValues): Record<string, unknown> {
  return {
    full_name: values.full_name.trim(),
    email: emptyToNull(values.email),
    phone: emptyToNull(values.phone),
    license_number: emptyToNull(values.license_number),
    license_code: emptyToNull(values.license_code),
    license_code_other:
      values.license_code === "Other" ? emptyToNull(values.license_code_other) : null,
    license_expires_on: emptyToNull(values.license_expires_on),
    pdp_number: emptyToNull(values.pdp_number),
    pdp_categories: emptyToNull(values.pdp_categories),
    pdp_expires_on: emptyToNull(values.pdp_expires_on),
    profile_id: emptyToNull(values.profile_id),
    status: values.status,
  };
}

type ProfileOption = { label: string; value: string };

export function DriverCaptureForm({
  initial,
  onSubmit,
  submitting,
  profileOptions,
  scanAssistEnabled,
  submitLabel = "Save driver",
}: {
  initial?: Driver;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
  profileOptions: ProfileOption[];
  scanAssistEnabled: boolean;
  submitLabel?: string;
}) {
  const form = useForm<DriverValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      full_name: initial?.full_name ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      license_number: initial?.license_number ?? "",
      license_code: (initial?.license_code as DriverValues["license_code"]) ?? "",
      license_code_other: initial?.license_code_other ?? "",
      license_expires_on: toDateInput(initial?.license_expires_on),
      pdp_number: initial?.pdp_number ?? "",
      pdp_categories: initial?.pdp_categories ?? "",
      pdp_expires_on: toDateInput(initial?.pdp_expires_on),
      profile_id: initial?.profile_id ?? "",
      status: initial?.status ?? "active",
    },
  });

  const licenseCode = useWatch({ control: form.control, name: "license_code" });
  const subjectId = initial?.id;

  return (
    <form
      className="mx-auto w-full max-w-md space-y-4 px-1 pb-8"
      onSubmit={form.handleSubmit((values) => onSubmit(driverValuesToPayload(values)))}
    >
      <CaptureSection title="Contact" description="Name and contact details for this driver.">
        <TextField control={form.control} name="full_name" label="Full name" />
        <TextField control={form.control} name="email" label="Email" type="email" />
        <TextField control={form.control} name="phone" label="Phone" />
      </CaptureSection>

      <CaptureSection title="Driver licence" description="Licence fields and optional document photo.">
        <TextField control={form.control} name="license_number" label="Licence number" />
        <SelectField
          control={form.control}
          name="license_code"
          label="Licence code"
          options={licenseCodeOptions}
          placeholder="Optional"
        />
        {licenseCode === "Other" ? (
          <TextField
            control={form.control}
            name="license_code_other"
            label="Explain licence code"
          />
        ) : null}
        <TextField
          control={form.control}
          name="license_expires_on"
          label="Licence expiry"
          type="date"
        />
        {subjectId ? (
          <ComplianceDocumentSection
            subjectKind="driver"
            subjectId={subjectId}
            docType="driver_licence"
            label="Licence document (photo or upload)"
            scanEnabled={scanAssistEnabled}
            onApplyScanFields={(values) => {
              for (const [key, value] of Object.entries(values)) {
                form.setValue(key as keyof DriverValues, value, { shouldDirty: true });
              }
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Save the driver once to attach a licence photo or PDF.
          </p>
        )}
      </CaptureSection>

      <CaptureSection title={PRDP_SHORT_LABEL} description="Professional driving permit details.">
        <TextField control={form.control} name="pdp_number" label={`${PRDP_SHORT_LABEL} number`} />
        <TextField
          control={form.control}
          name="pdp_categories"
          label={`${PRDP_SHORT_LABEL} categories`}
          placeholder="e.g. G,P"
        />
        <TextField
          control={form.control}
          name="pdp_expires_on"
          label={`${PRDP_SHORT_LABEL} expiry`}
          type="date"
        />
        {subjectId ? (
          <ComplianceDocumentSection
            subjectKind="driver"
            subjectId={subjectId}
            docType="prdp"
            label={`${PRDP_SHORT_LABEL} document (photo or upload)`}
            scanEnabled={scanAssistEnabled}
            onApplyScanFields={(values) => {
              for (const [key, value] of Object.entries(values)) {
                form.setValue(key as keyof DriverValues, value, { shouldDirty: true });
              }
            }}
          />
        ) : null}
      </CaptureSection>

      <CaptureSection title="Access & status">
        <SelectField
          control={form.control}
          name="profile_id"
          label="Linked user profile"
          options={profileOptions}
          placeholder="Optional"
        />
        <SelectField
          control={form.control}
          name="status"
          label="Status"
          options={statusOptions}
        />
      </CaptureSection>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
