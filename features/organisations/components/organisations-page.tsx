"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Building, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  organisationSchema,
  type OrganisationValues,
} from "@/features/organisations/schemas/organisation";
import {
  useCreateOrganisation,
  useOrganisations,
  useSoftDeleteOrganisation,
  useUpdateOrganisation,
} from "@/features/organisations/hooks/use-organisations";
import type { Organisation } from "@/types";
import { formatDate, slugify } from "@/utils/format";

function OrganisationForm({
  mode,
  initial,
  onSubmit,
  submitting,
}: {
  mode: "create" | "edit";
  initial?: Organisation;
  onSubmit: (values: OrganisationValues) => void;
  submitting: boolean;
}) {
  const form = useForm<OrganisationValues>({
    resolver: zodResolver(organisationSchema),
    defaultValues: {
      name: initial?.name ?? "",
      slug: initial?.slug ?? "",
    },
  });

  const name = form.watch("name");

  useEffect(() => {
    if (mode !== "create") return;
    form.setValue("slug", slugify(name ?? ""), { shouldValidate: false });
  }, [mode, name, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <TextField control={form.control} name="name" label="Name" placeholder="Acme Transport" />
      <TextField
        control={form.control}
        name="slug"
        label="Slug"
        placeholder="acme-transport"
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </Button>
    </form>
  );
}

export function OrganisationsPage() {
  const { can } = useOrg();
  const canManage = can("organisations:manage");
  const { data, isLoading } = useOrganisations();
  const createMutation = useCreateOrganisation();
  const updateMutation = useUpdateOrganisation();
  const deleteMutation = useSoftDeleteOrganisation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organisation | null>(null);
  const [deleting, setDeleting] = useState<Organisation | null>(null);

  const columns = useMemo<ColumnDef<Organisation, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "slug", header: "Slug" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => formatDate(row.original.created_at),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: Organisation } }) => (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(row.original);
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleting(row.original)}
                  >
                    Delete
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<Organisation, unknown>,
          ]
        : []),
    ],
    [canManage]
  );

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Organisations"
        description="Manage tenant organisations across the platform."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              Add organisation
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No organisations yet"
          description="Create the first organisation to get started."
          actionLabel={canManage ? "Add organisation" : undefined}
          onAction={
            canManage
              ? () => {
                  setEditing(null);
                  setDialogOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <DataTable columns={columns} data={rows} />
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit organisation" : "Add organisation"}
      >
        <OrganisationForm
          key={editing?.id ?? "create"}
          mode={editing ? "edit" : "create"}
          initial={editing ?? undefined}
          submitting={createMutation.isPending || updateMutation.isPending}
          onSubmit={(values) => {
            if (editing) {
              updateMutation.mutate(
                { id: editing.id, input: values },
                { onSuccess: () => setDialogOpen(false) }
              );
            } else {
              createMutation.mutate(values, {
                onSuccess: () => setDialogOpen(false),
              });
            }
          }}
        />
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete organisation?"
        description="This will soft-delete the organisation. Related data remains in the database."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
          });
        }}
      />
    </div>
  );
}
