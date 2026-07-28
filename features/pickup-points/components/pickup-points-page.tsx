"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPinned } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  pickupPointSchema,
  type PickupPointValues,
} from "@/features/pickup-points/schemas/pickup-point";
import { parseOptionalCoord } from "@/features/sites/schemas/site";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createPickupPoint,
  deletePickupPoint,
  listPickupPoints,
  restorePickupPoint,
  updatePickupPoint,
} from "@/services/pickup-points.service";
import type { PickupPoint } from "@/types";
import { queryKeys } from "@/utils/query";

const NONE = "none";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function PickupPointForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: PickupPoint;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { sites, areas } = useEntityOptions(organisationId);
  const form = useForm<PickupPointValues>({
    resolver: zodResolver(pickupPointSchema),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      address: initial?.address ?? "",
      latitude:
        initial?.latitude != null ? String(initial.latitude) : "",
      longitude:
        initial?.longitude != null ? String(initial.longitude) : "",
      site_id: initial?.site_id ?? NONE,
      area_id: initial?.area_id ?? NONE,
      status: initial?.status ?? "active",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          code: emptyToNull(values.code),
          address: emptyToNull(values.address),
          latitude: parseOptionalCoord(values.latitude),
          longitude: parseOptionalCoord(values.longitude),
          site_id: emptyToNull(values.site_id),
          area_id: emptyToNull(values.area_id),
          status: values.status,
        })
      )}
    >
      <TextField control={form.control} name="name" label="Name" />
      <TextField control={form.control} name="code" label="Code" />
      <TextAreaField control={form.control} name="address" label="Address" />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          control={form.control}
          name="latitude"
          label="Latitude"
          placeholder="-26.2041"
        />
        <TextField
          control={form.control}
          name="longitude"
          label="Longitude"
          placeholder="28.0473"
        />
      </div>
      <SelectField
        control={form.control}
        name="site_id"
        label="Site"
        options={[{ label: "None", value: NONE }, ...sites]}
      />
      <SelectField
        control={form.control}
        name="area_id"
        label="Area"
        options={[{ label: "None", value: NONE }, ...areas]}
      />
      <SelectField
        control={form.control}
        name="status"
        label="Status"
        options={statusOptions}
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function PickupPointsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("pickup_points:manage");

  const columns = useMemo<ColumnDef<PickupPoint, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "code", header: "Code" },
      { accessorKey: "address", header: "Address" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    []
  );

  return (
    <EntityCrudPage<PickupPoint>
      title="Pickup Points"
      description="Manage pickup points for the active organisation."
      organisationId={organisationId}
      queryKey={
        organisationId
          ? queryKeys.pickupPoints(organisationId)
          : ["pickup-points", "none"]
      }
      columns={columns}
      list={listPickupPoints}
      create={
        canManage
          ? (orgId, values) =>
              createPickupPoint(
                orgId,
                values as Parameters<typeof createPickupPoint>[1]
              )
          : undefined
      }
      update={
        canManage
          ? (id, values) =>
              updatePickupPoint(
                id,
                values as Parameters<typeof updatePickupPoint>[1]
              )
          : undefined
      }
      remove={canManage ? deletePickupPoint : undefined}
      restore={canManage ? restorePickupPoint : undefined}
      canManage={canManage}
      searchFilter={(row, query) =>
        [row.name, row.code, row.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      }
      emptyIcon={MapPinned}
      createLabel="Add pickup point"
      renderForm={({ initial, onSubmit, submitting }) => (
        <PickupPointForm
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
