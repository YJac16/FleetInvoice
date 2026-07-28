"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Route as RouteIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { RouteStopsDialog } from "@/features/routes/components/route-stops-dialog";
import { routeSchema, type RouteValues } from "@/features/routes/schemas/route";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createRoute,
  deleteRoute,
  listRoutes,
  restoreRoute,
  updateRoute,
} from "@/services/routes.service";
import type { Route } from "@/types";
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

function RouteForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: Route;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies, areas } = useEntityOptions(organisationId);
  const form = useForm<RouteValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      description: initial?.description ?? "",
      company_id: initial?.company_id ?? NONE,
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
          description: emptyToNull(values.description),
          company_id: emptyToNull(values.company_id),
          area_id: emptyToNull(values.area_id),
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
        name="company_id"
        label="Company"
        options={[{ label: "None", value: NONE }, ...companies]}
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

export function RoutesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("routes:manage");
  const [stopsRoute, setStopsRoute] = useState<Route | null>(null);

  const columns = useMemo<ColumnDef<Route, unknown>[]>(
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
    <>
      <EntityCrudPage<Route>
        title="Routes"
        description="Manage routes for the active organisation."
        organisationId={organisationId}
        queryKey={
          organisationId ? queryKeys.routes(organisationId) : ["routes", "none"]
        }
        columns={columns}
        list={listRoutes}
        create={
          canManage
            ? (orgId, values) =>
                createRoute(orgId, values as Parameters<typeof createRoute>[1])
            : undefined
        }
        update={
          canManage
            ? (id, values) =>
                updateRoute(id, values as Parameters<typeof updateRoute>[1])
            : undefined
        }
        remove={canManage ? deleteRoute : undefined}
        restore={canManage ? restoreRoute : undefined}
        canManage={canManage}
        searchFilter={(row, query) =>
          [row.name, row.code, row.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        }
        emptyIcon={RouteIcon}
        createLabel="Add route"
        rowActions={(row) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStopsRoute(row)}
          >
            Stops
          </Button>
        )}
        renderForm={({ initial, onSubmit, submitting }) => (
          <RouteForm
            key={initial?.id ?? "create"}
            organisationId={organisationId}
            initial={initial}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        )}
      />

      {organisationId ? (
        <RouteStopsDialog
          open={Boolean(stopsRoute)}
          onOpenChange={(open) => !open && setStopsRoute(null)}
          organisationId={organisationId}
          route={stopsRoute}
          canManage={canManage}
        />
      ) : null}
    </>
  );
}
