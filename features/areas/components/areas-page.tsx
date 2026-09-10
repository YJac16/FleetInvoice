"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin } from "lucide-react";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AreaCircleMap } from "@/features/areas/components/area-circle-map";
import { AreaPlaceSearch } from "@/features/areas/components/area-place-search";
import {
  AREA_RADIUS_MAX_M,
  AREA_RADIUS_MIN_M,
  clampAreaRadius,
} from "@/features/areas/lib/geocode";
import { areaSchema, type AreaValues } from "@/features/areas/schemas/area";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createArea,
  deleteArea,
  listAreas,
  restoreArea,
  updateArea,
} from "@/services/areas.service";
import type { Area } from "@/types";
import { queryKeys } from "@/utils/query";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function AreaForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Area;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const form = useForm<AreaValues>({
    resolver: zodResolver(areaSchema),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      description: initial?.description ?? "",
      status: initial?.status ?? "active",
      lat: initial?.lat ?? undefined,
      lng: initial?.lng ?? undefined,
      radius_m: initial?.radius_m ?? 150,
      mapbox_place_id:
        initial?.mapbox_place_id ??
        (initial?.lat != null && initial?.lng != null
          ? `verified:${initial.id}`
          : ""),
      place_name: initial?.place_name ?? initial?.name ?? "",
    },
  });

  const lat = form.watch("lat");
  const lng = form.watch("lng");
  const radius = form.watch("radius_m");

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          code: emptyToNull(values.code),
          description: emptyToNull(values.description),
          status: values.status,
          lat: values.lat,
          lng: values.lng,
          radius_m: values.radius_m,
          mapbox_place_id: values.mapbox_place_id,
          place_name: values.place_name,
        })
      )}
    >
      <AreaPlaceSearch
        onSelect={(place) => {
          form.setValue("name", form.getValues("name") || place.name, {
            shouldDirty: true,
          });
          form.setValue("lat", place.lat, { shouldValidate: true });
          form.setValue("lng", place.lng, { shouldValidate: true });
          form.setValue("radius_m", place.radiusM, { shouldValidate: true });
          form.setValue("mapbox_place_id", place.id, { shouldValidate: true });
          form.setValue("place_name", place.placeName, { shouldValidate: true });
        }}
      />
      <TextField control={form.control} name="name" label="Name" />
      <TextField control={form.control} name="code" label="Code" />
      <TextAreaField
        control={form.control}
        name="description"
        label="Description"
      />
      {typeof lat === "number" && typeof lng === "number" ? (
        <AreaCircleMap
          lat={lat}
          lng={lng}
          radiusM={radius || 150}
          onCenterChange={(nextLng, nextLat) => {
            form.setValue("lat", nextLat, { shouldDirty: true });
            form.setValue("lng", nextLng, { shouldDirty: true });
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a search result with a map pin before saving. That verifies the
          destination exists.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="area-radius">Fence radius ({radius || 150} m)</Label>
        <Controller
          control={form.control}
          name="radius_m"
          render={({ field }) => (
            <Input
              id="area-radius"
              type="range"
              min={AREA_RADIUS_MIN_M}
              max={AREA_RADIUS_MAX_M}
              step={10}
              value={field.value ?? 150}
              onChange={(e) =>
                field.onChange(clampAreaRadius(Number(e.target.value)))
              }
            />
          )}
        />
        <p className="text-xs text-muted-foreground">
          Drag the pin and resize the circle. GPS enter/exit uses this fence.
        </p>
      </div>
      <SelectField
        control={form.control}
        name="status"
        label="Status"
        options={statusOptions}
      />
      {form.formState.errors.mapbox_place_id ? (
        <p className="text-xs text-destructive">
          {form.formState.errors.mapbox_place_id.message}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function AreasPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("areas:manage");

  const columns = useMemo<ColumnDef<Area, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "code", header: "Code" },
      {
        id: "place",
        header: "Place",
        cell: ({ row }) => row.original.place_name ?? "—",
      },
      {
        id: "radius",
        header: "Fence (m)",
        cell: ({ row }) =>
          row.original.radius_m != null ? Math.round(row.original.radius_m) : "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    []
  );

  return (
    <EntityCrudPage<Area>
      title="Areas"
      description="Map-verified destinations drivers pick when completing waybills. Saving also creates the GPS geofence circle."
      organisationId={organisationId}
      queryKey={organisationId ? queryKeys.areas(organisationId) : ["areas", "none"]}
      columns={columns}
      list={listAreas}
      create={
        canManage
          ? (orgId, values) =>
              createArea(orgId, values as Parameters<typeof createArea>[1])
          : undefined
      }
      update={
        canManage
          ? (id, values) =>
              updateArea(id, values as Parameters<typeof updateArea>[1])
          : undefined
      }
      remove={canManage ? deleteArea : undefined}
      restore={canManage ? restoreArea : undefined}
      canManage={canManage}
      searchFilter={(row, query) =>
        [row.name, row.code, row.description, row.place_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      }
      emptyIcon={MapPin}
      createLabel="Add area"
      formDialogClassName="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
      renderForm={({ initial, onSubmit, submitting }) => (
        <AreaForm
          key={initial?.id ?? "create"}
          initial={initial}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    />
  );
}
