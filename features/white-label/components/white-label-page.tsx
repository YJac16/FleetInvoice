"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listOrganisations } from "@/services/organisations.service";
import {
  deleteWhiteLabelConfig,
  listWhiteLabelConfigs,
  upsertWhiteLabelConfig,
} from "@/services/white-label.service";
import { getErrorMessage } from "@/utils/errors";

type Row = Awaited<ReturnType<typeof listWhiteLabelConfigs>>[number];

export function WhiteLabelPage() {
  const { can, isPlatformOwner } = useOrg();
  const canManage = can("organisations:manage") && isPlatformOwner;
  const queryClient = useQueryClient();
  const [organisationId, setOrganisationId] = useState("");
  const [hostname, setHostname] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [accentColor, setAccentColor] = useState("#2563eb");

  const configsQuery = useQuery({
    queryKey: ["white-label"],
    queryFn: listWhiteLabelConfigs,
    enabled: canManage,
  });

  const orgsQuery = useQuery({
    queryKey: ["organisations"],
    queryFn: listOrganisations,
    enabled: canManage,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertWhiteLabelConfig({
        organisation_id: organisationId,
        hostname,
        logo_url: logoUrl || null,
        primary_color: primaryColor || null,
        accent_color: accentColor || null,
      }),
    onSuccess: async () => {
      toast.success("White-label config saved");
      setHostname("");
      await queryClient.invalidateQueries({ queryKey: ["white-label"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWhiteLabelConfig(id),
    onSuccess: async () => {
      toast.success("Removed");
      await queryClient.invalidateQueries({ queryKey: ["white-label"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "org",
        header: "Organisation",
        cell: ({ row }) =>
          row.original.organisations?.name ??
          row.original.organisation_id.slice(0, 8),
      },
      { accessorKey: "hostname", header: "Hostname" },
      {
        id: "colors",
        header: "Colors",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.primary_color ?? "—"} /{" "}
            {row.original.accent_color ?? "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMutation.mutate(row.original.id)}
          >
            Delete
          </Button>
        ),
      },
    ],
    [deleteMutation]
  );

  if (!canManage) {
    return (
      <EmptyState
        title="No access"
        description="Only platform owners manage white-label domains."
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="White-label"
        description="Map custom hostnames to organisations and theme tokens. Attach the domain in Vercel, then add DNS."
      />

      <form
        className="grid max-w-xl gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!organisationId || !hostname) {
            toast.error("Organisation and hostname are required");
            return;
          }
          saveMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Organisation</Label>
          <Select
            value={organisationId}
            onValueChange={(v) => setOrganisationId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select organisation" />
            </SelectTrigger>
            <SelectContent>
              {(orgsQuery.data ?? []).map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hostname">Hostname</Label>
          <Input
            id="hostname"
            placeholder="client.example.com"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logo">Logo URL</Label>
          <Input
            id="logo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="primary">Primary</Label>
            <Input
              id="primary"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accent">Accent</Label>
            <Input
              id="accent"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save config"}
        </Button>
      </form>

      {configsQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <DataTable
          columns={columns}
          data={configsQuery.data ?? []}
          emptyMessage="No white-label hosts yet."
        />
      )}
    </div>
  );
}
