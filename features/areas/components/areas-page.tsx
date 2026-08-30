"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
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
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          code: emptyToNull(values.code),
          description: emptyToNull(values.description),
          status: values.status,
        })
      )}
    >
      <TextField control={form.control} name="name" label="Name" />
      <TextField control={form.control} name="code" label="Code" />
      <TextAreaField
        control={form.control}
        name="description"
        label="Description"
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

export function AreasPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("areas:manage");

  const columns = useMemo<ColumnDef<Area, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "code", header: "Code" },
      { accessorKey: "description", header: "Description" },
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
      description="Manage geographic areas for the active organisation."
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
        [row.name, row.code, row.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      }
      emptyIcon={MapPin}
      createLabel="Add area"
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
