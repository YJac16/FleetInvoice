"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { EmptyState } from "@/components/shared/empty-state";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  geofenceSchema,
  type GeofenceValues,
} from "@/features/dispatch/schemas/geofence";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  createGeofence,
  deleteGeofence,
  listGeofences,
  updateGeofence,
} from "@/services/geofences.service";
import type { Geofence } from "@/types";
import { queryKeys } from "@/utils/query";

const NONE = "none";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function GeofenceForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: Geofence;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { sites, pickupPoints } = useEntityOptions(organisationId, {
    includePickupPoints: true,
  });
  const form = useForm<GeofenceValues>({
    resolver: zodResolver(geofenceSchema),
    defaultValues: {
      name: initial?.name ?? "",
      center_lat: String(initial?.center_lat ?? -26.2041),
      center_lng: String(initial?.center_lng ?? 28.0473),
      radius_m: String(initial?.radius_m ?? 150),
      site_id: initial?.site_id ?? NONE,
      pickup_point_id: initial?.pickup_point_id ?? NONE,
      is_active: initial?.is_active === false ? "false" : "true",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        const center_lat = Number(values.center_lat);
        const center_lng = Number(values.center_lng);
        const radius_m = Number(values.radius_m);
        if (
          Number.isNaN(center_lat) ||
          Number.isNaN(center_lng) ||
          Number.isNaN(radius_m) ||
          radius_m <= 0
        ) {
          return;
        }
        onSubmit({
          name: values.name.trim(),
          center_lat,
          center_lng,
          radius_m,
          site_id: emptyToNull(values.site_id),
          pickup_point_id: emptyToNull(values.pickup_point_id),
          is_active: values.is_active === "true",
        });
      })}
    >
      <TextField control={form.control} name="name" label="Name" />
      <TextField
        control={form.control}
        name="center_lat"
        label="Center latitude"
      />
      <TextField
        control={form.control}
        name="center_lng"
        label="Center longitude"
      />
      <TextField
        control={form.control}
        name="radius_m"
        label="Radius (metres)"
      />
      <SelectField
        control={form.control}
        name="site_id"
        label="Site (optional)"
        options={[{ label: "None", value: NONE }, ...sites]}
      />
      <SelectField
        control={form.control}
        name="pickup_point_id"
        label="Pickup point (optional)"
        options={[{ label: "None", value: NONE }, ...pickupPoints]}
      />
      <SelectField
        control={form.control}
        name="is_active"
        label="Active"
        options={[
          { label: "Active", value: "true" },
          { label: "Inactive", value: "false" },
        ]}
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function GeofencesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("geofences:manage");
  const canView = can("geofences:view") || canManage;

  const columns = useMemo<ColumnDef<Geofence, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        id: "center",
        header: "Center",
        cell: ({ row }) =>
          `${row.original.center_lat.toFixed(4)}, ${row.original.center_lng.toFixed(4)}`,
      },
      {
        accessorKey: "radius_m",
        header: "Radius (m)",
        cell: ({ row }) => row.original.radius_m,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (row.original.is_active ? "Yes" : "No"),
      },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <EmptyState
          title="No access"
          description="You need geofences view permission to open this page."
        />
      </div>
    );
  }

  return (
    <EntityCrudPage<Geofence>
      title="Geofences"
      description="Circular fences used for enter/exit alerts during GPS ingest."
      organisationId={organisationId}
      queryKey={
        organisationId ? queryKeys.geofences(organisationId) : ["geofences", "none"]
      }
      columns={columns}
      list={listGeofences}
      create={
        canManage
          ? (orgId, values) =>
              createGeofence(orgId, {
                name: String(values.name),
                center_lat: Number(values.center_lat),
                center_lng: Number(values.center_lng),
                radius_m: Number(values.radius_m),
                site_id: (values.site_id as string | null) ?? null,
                pickup_point_id: (values.pickup_point_id as string | null) ?? null,
                is_active: Boolean(values.is_active),
              })
          : undefined
      }
      update={
        canManage
          ? (id, values) =>
              updateGeofence(id, {
                ...(values as Partial<Geofence>),
                is_active:
                  values.is_active === undefined
                    ? undefined
                    : Boolean(values.is_active),
              })
          : undefined
      }
      remove={canManage ? deleteGeofence : undefined}
      canManage={canManage}
      searchFilter={(row, query) =>
        row.name.toLowerCase().includes(query)
      }
      emptyIcon={MapPin}
      createLabel="Add geofence"
      renderForm={({ initial, onSubmit, submitting }) => (
        <GeofenceForm
          key={initial?.id ?? "create"}
          organisationId={organisationId}
          initial={initial}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    />
  );
}
