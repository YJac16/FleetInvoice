"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Warehouse } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { siteSchema, type SiteValues, parseOptionalCoord } from "@/features/sites/schemas/site";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createSite,
  deleteSite,
  listSites,
  restoreSite,
  updateSite,
} from "@/services/sites.service";
import type { Site } from "@/types";
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

function SiteForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: Site;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies, areas } = useEntityOptions(organisationId);
  const form = useForm<SiteValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      address: initial?.address ?? "",
      latitude:
        initial?.latitude != null ? String(initial.latitude) : "",
      longitude:
        initial?.longitude != null ? String(initial.longitude) : "",
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
          address: emptyToNull(values.address),
          latitude: parseOptionalCoord(values.latitude),
          longitude: parseOptionalCoord(values.longitude),
          company_id: emptyToNull(values.company_id),
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

export function SitesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("sites:manage");

  const columns = useMemo<ColumnDef<Site, unknown>[]>(
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
    <EntityCrudPage<Site>
      title="Sites"
      description="Manage work sites for the active organisation."
      organisationId={organisationId}
      queryKey={organisationId ? queryKeys.sites(organisationId) : ["sites", "none"]}
      columns={columns}
      list={listSites}
      create={
        canManage
          ? (orgId, values) =>
              createSite(orgId, values as Parameters<typeof createSite>[1])
          : undefined
      }
      update={
        canManage
          ? (id, values) =>
              updateSite(id, values as Parameters<typeof updateSite>[1])
          : undefined
      }
      remove={canManage ? deleteSite : undefined}
      restore={canManage ? restoreSite : undefined}
      canManage={canManage}
      searchFilter={(row, query) =>
        [row.name, row.code, row.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      }
      emptyIcon={Warehouse}
      createLabel="Add site"
      renderForm={({ initial, onSubmit, submitting }) => (
        <SiteForm
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
