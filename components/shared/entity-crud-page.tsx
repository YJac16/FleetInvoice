"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/forms/form-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import type { ListTenantOptions } from "@/services/tenant-entity.service";
import { getErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

export type ListMode = "active" | "archived";

type EntityCrudPageProps<T extends { id: string }> = {
  title: string;
  description: string;
  organisationId: string | null;
  queryKey: readonly unknown[];
  columns: ColumnDef<T, unknown>[];
  list: (
    organisationId: string,
    options?: ListTenantOptions
  ) => Promise<T[]>;
  create?: (
    organisationId: string,
    values: Record<string, unknown>
  ) => Promise<T>;
  update?: (id: string, values: Record<string, unknown>) => Promise<T>;
  remove?: (id: string) => Promise<void>;
  restore?: (id: string) => Promise<void>;
  canManage: boolean;
  searchFilter: (row: T, query: string) => boolean;
  renderForm: (args: {
    mode: "create" | "edit";
    initial?: T;
    onSubmit: (values: Record<string, unknown>) => void;
    submitting: boolean;
  }) => ReactNode;
  emptyIcon?: LucideIcon;
  createLabel?: string;
  headerActions?: ReactNode;
  rowActions?: (row: T) => ReactNode;
};

export function EntityCrudPage<T extends { id: string }>({
  title,
  description,
  organisationId,
  queryKey,
  columns,
  list,
  create,
  update,
  remove,
  restore,
  canManage,
  searchFilter,
  renderForm,
  emptyIcon: EmptyIcon,
  createLabel = "Add",
  headerActions,
  rowActions,
}: EntityCrudPageProps<T>) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [listMode, setListMode] = useState<ListMode>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [restoring, setRestoring] = useState<T | null>(null);

  const effectiveQueryKey = [...queryKey, listMode] as const;

  const query = useQuery({
    queryKey: effectiveQueryKey,
    queryFn: () =>
      list(organisationId!, {
        archivedOnly: listMode === "archived",
      }),
    enabled: Boolean(organisationId),
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      create!(organisationId!, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Created");
      setDialogOpen(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      update!(editing!.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Updated");
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove!(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Archived");
      setDeleting(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restore!(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Restored");
      setRestoring(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rows = useMemo(() => {
    const data = query.data ?? [];
    if (!debouncedSearch.trim()) return data;
    return data.filter((row) =>
      searchFilter(row, debouncedSearch.trim().toLowerCase())
    );
  }, [query.data, debouncedSearch, searchFilter]);

  const actionColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!canManage) return columns;
    return [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {rowActions?.(row.original)}
            {listMode === "active" && update ? (
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
            ) : null}
            {listMode === "active" && remove ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleting(row.original)}
              >
                Archive
              </Button>
            ) : null}
            {listMode === "archived" && restore ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRestoring(row.original)}
              >
                Restore
              </Button>
            ) : null}
          </div>
        ),
      },
    ];
  }, [canManage, columns, update, remove, restore, listMode, rowActions]);

  if (!organisationId) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="Select an organisation"
          description="Choose an organisation from the switcher to manage this data."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
            {canManage && create && listMode === "active" ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                {createLabel}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar value={search} onChange={setSearch} />
        <div className="inline-flex rounded-xl border bg-card p-1">
          <button
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              listMode === "active"
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setListMode("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              listMode === "archived"
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setListMode("archived")}
          >
            Archived
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 && !debouncedSearch ? (
        <EmptyState
          icon={EmptyIcon}
          title={
            listMode === "archived"
              ? `No archived ${title.toLowerCase()}`
              : `No ${title.toLowerCase()} yet`
          }
          description={
            listMode === "archived"
              ? "Archived records will appear here."
              : "Create your first record to get started."
          }
          actionLabel={
            canManage && create && listMode === "active"
              ? createLabel
              : undefined
          }
          onAction={
            canManage && create && listMode === "active"
              ? () => {
                  setEditing(null);
                  setDialogOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <DataTable columns={actionColumns} data={rows} />
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `Edit ${title.slice(0, -1) || title}` : createLabel}
      >
        {renderForm({
          mode: editing ? "edit" : "create",
          initial: editing ?? undefined,
          submitting: createMutation.isPending || updateMutation.isPending,
          onSubmit: (values) => {
            if (editing) updateMutation.mutate(values);
            else createMutation.mutate(values);
          },
        })}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Archive record?"
        description="This soft-deletes the record. You can restore it from the Archived tab."
        confirmLabel="Archive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />

      <ConfirmDialog
        open={Boolean(restoring)}
        onOpenChange={(open) => !open && setRestoring(null)}
        title="Restore record?"
        description="The record will return to the active list. This may fail if another active row uses the same unique key."
        confirmLabel="Restore"
        loading={restoreMutation.isPending}
        onConfirm={() => restoring && restoreMutation.mutate(restoring.id)}
      />
    </div>
  );
}
