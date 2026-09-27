"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { CaptureSection } from "@/features/compliance/components/capture-section";
import { ComplianceDocumentSection } from "@/features/compliance/components/compliance-document-section";
import {
  normalizeVehicleFields,
  vehicleSchema,
  type VehicleValues,
} from "@/features/vehicles/schemas/vehicle";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  ENTITY_STATUSES,
  STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  VEHICLE_TYPES,
} from "@/lib/constants";
import type { Vehicle } from "@/types";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

const vehicleTypeOptions = VEHICLE_TYPES.map((type) => ({
  label: VEHICLE_TYPE_LABELS[type],
  value: type,
}));

type CompanyOption = { label: string; value: string };

export function VehicleCaptureForm({
  initial,
  onSubmit,
  submitting,
  companies,
  scanAssistEnabled,
  submitLabel = "Save vehicle",
}: {
  initial?: Vehicle;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
  companies: CompanyOption[];
  scanAssistEnabled: boolean;
  submitLabel?: string;
}) {
  const form = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: initial?.name ?? "",
      registration_number: initial?.registration_number ?? "",
      vin: initial?.vin ?? "",
      engine_number: initial?.engine_number ?? "",
      make: initial?.make ?? "",
      model: initial?.model ?? "",
      model_year:
        initial?.model_year === null || initial?.model_year === undefined
          ? ""
          : String(initial.model_year),
      colour: initial?.colour ?? "",
      classification: initial?.classification ?? "",
      operating_permit_number: initial?.operating_permit_number ?? "",
      operating_permit_expires_on: initial?.operating_permit_expires_on?.slice(0, 10) ?? "",
      license_disc_expires_on: initial?.license_disc_expires_on?.slice(0, 10) ?? "",
      vehicle_type: initial?.vehicle_type ?? "other",
      capacity:
        initial?.capacity === null || initial?.capacity === undefined
          ? ""
          : String(initial.capacity),
      company_id: initial?.company_id ?? "none",
      status: initial?.status ?? "active",
    },
  });

  const subjectId = initial?.id;

  return (
    <form
      className="mx-auto w-full max-w-md space-y-4 px-1 pb-8"
      onSubmit={form.handleSubmit((values) => {
        const normalized = normalizeVehicleFields(values);
        if (!normalized.ok) {
          toast.error(normalized.message);
          return;
        }
        onSubmit(normalized.data);
      })}
    >
      <CaptureSection
        title="Registration & identity"
        description="NaTIS RC fields are manual only — no RC image is stored."
      >
        <TextField control={form.control} name="name" label="Display name" />
        <TextField
          control={form.control}
          name="registration_number"
          label="Registration number"
        />
        <TextField control={form.control} name="vin" label="VIN" />
        <TextField control={form.control} name="engine_number" label="Engine number" />
        <TextField control={form.control} name="make" label="Make" />
        <TextField control={form.control} name="model" label="Model" />
        <TextField
          control={form.control}
          name="model_year"
          label="Year"
          type="number"
          placeholder="e.g. 2022"
        />
        <TextField
          control={form.control}
          name="license_disc_expires_on"
          label="Licence disc expiry"
          type="date"
        />
      </CaptureSection>

      <CaptureSection title="Operating permit">
        <TextField
          control={form.control}
          name="operating_permit_number"
          label="Operating permit number"
        />
        <TextField
          control={form.control}
          name="operating_permit_expires_on"
          label="Operating permit expiry"
          type="date"
        />
      </CaptureSection>

      {subjectId ? (
        <CaptureSection
          title="Documents"
          description="Licence disc and operating permit files only (camera or upload)."
        >
          <ComplianceDocumentSection
            subjectKind="vehicle"
            subjectId={subjectId}
            docType="license_disk"
            label="Licence disc document"
            scanEnabled={scanAssistEnabled}
            onApplyScanFields={(values) => {
              for (const [key, value] of Object.entries(values)) {
                form.setValue(key as keyof VehicleValues, value, { shouldDirty: true });
              }
            }}
          />
          <ComplianceDocumentSection
            subjectKind="vehicle"
            subjectId={subjectId}
            docType="operating_permit"
            label="Operating permit document"
            scanEnabled={scanAssistEnabled}
            onApplyScanFields={(values) => {
              for (const [key, value] of Object.entries(values)) {
                form.setValue(key as keyof VehicleValues, value, { shouldDirty: true });
              }
            }}
          />
        </CaptureSection>
      ) : (
        <p className="text-xs text-muted-foreground">
          Save the vehicle once to attach licence disc or operating permit photos.
        </p>
      )}

      <CaptureSection title="Fleet details">
        <TextField control={form.control} name="colour" label="Colour" />
        <TextField
          control={form.control}
          name="classification"
          label="Classification"
          placeholder="Optional"
        />
        <SelectField
          control={form.control}
          name="vehicle_type"
          label="Vehicle type"
          options={vehicleTypeOptions}
        />
        <SelectField
          control={form.control}
          name="company_id"
          label="Company (optional)"
          options={companies}
        />
        <TextField
          control={form.control}
          name="capacity"
          label="Capacity"
          type="number"
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
