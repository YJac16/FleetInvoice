"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
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
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  listRouteStops,
  replaceRouteStops,
  type RouteStopInput,
} from "@/services/routes.service";
import type { Route, RouteStop } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const NONE = "none";

type StopRow = {
  key: string;
  site_id: string;
  pickup_point_id: string;
  label: string;
  dwell_minutes: string;
  notes: string;
};

function toRows(stops: RouteStop[]): StopRow[] {
  return stops.map((stop) => ({
    key: stop.id,
    site_id: stop.site_id ?? NONE,
    pickup_point_id: stop.pickup_point_id ?? NONE,
    label: stop.label ?? "",
    dwell_minutes:
      stop.dwell_minutes === null || stop.dwell_minutes === undefined
        ? ""
        : String(stop.dwell_minutes),
    notes: stop.notes ?? "",
  }));
}

function emptyRow(): StopRow {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    site_id: NONE,
    pickup_point_id: NONE,
    label: "",
    dwell_minutes: "",
    notes: "",
  };
}

type RouteStopsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  route: Route | null;
  canManage: boolean;
};

export function RouteStopsDialog({
  open,
  onOpenChange,
  organisationId,
  route,
  canManage,
}: RouteStopsDialogProps) {
  const queryClient = useQueryClient();
  const { sites, pickupPoints } = useEntityOptions(organisationId, {
    includePickupPoints: true,
  });
  const [rows, setRows] = useState<StopRow[]>([]);

  const stopsQuery = useQuery({
    queryKey:
      route && organisationId
        ? queryKeys.routeStops(organisationId, route.id)
        : ["route-stops", "none"],
    queryFn: () => listRouteStops(organisationId, route!.id),
    enabled: open && Boolean(route),
  });

  useEffect(() => {
    if (open && stopsQuery.data) {
      setRows(toRows(stopsQuery.data));
    }
    if (!open) {
      setRows([]);
    }
  }, [open, stopsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: RouteStopInput[]) =>
      replaceRouteStops(organisationId, route!.id, input),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.routeStops(organisationId, route!.id),
      });
      setRows(toRows(data));
      toast.success("Stops updated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateRow = (key: string, patch: Partial<StopRow>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const moveRow = (key: string, direction: -1 | 1) => {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    const input: RouteStopInput[] = rows.map((row) => ({
      site_id: row.site_id === NONE ? null : row.site_id,
      pickup_point_id:
        row.pickup_point_id === NONE ? null : row.pickup_point_id,
      label: row.label.trim() ? row.label.trim() : null,
      dwell_minutes: row.dwell_minutes.trim()
        ? Number(row.dwell_minutes)
        : null,
      notes: row.notes.trim() ? row.notes.trim() : null,
    }));
    saveMutation.mutate(input);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={route ? `Stops · ${route.name}` : "Stops"}
      description="Order the stops along this route. Each stop is a site, a pickup point, or both."
    >
      {!route ? null : stopsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          {rows.length === 0 ? (
            <EmptyState
              title="No stops yet"
              description="Add stops below and set their order."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((row, index) => (
                <li key={row.key} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Stop {index + 1}
                    </span>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => moveRow(row.key, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === rows.length - 1}
                          onClick={() => moveRow(row.key, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(row.key)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Site</Label>
                      <Select
                        value={row.site_id}
                        onValueChange={(value) =>
                          updateRow(row.key, { site_id: value ?? NONE })
                        }
                        disabled={!canManage}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {sites.map((site) => (
                            <SelectItem key={site.value} value={site.value}>
                              {site.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Pickup point</Label>
                      <Select
                        value={row.pickup_point_id}
                        onValueChange={(value) =>
                          updateRow(row.key, {
                            pickup_point_id: value ?? NONE,
                          })
                        }
                        disabled={!canManage}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {pickupPoints.map((point) => (
                            <SelectItem key={point.value} value={point.value}>
                              {point.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Label</Label>
                      <Input
                        value={row.label}
                        onChange={(e) =>
                          updateRow(row.key, { label: e.target.value })
                        }
                        disabled={!canManage}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Dwell minutes</Label>
                      <Input
                        type="number"
                        value={row.dwell_minutes}
                        onChange={(e) =>
                          updateRow(row.key, { dwell_minutes: e.target.value })
                        }
                        disabled={!canManage}
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Notes</Label>
                    <Input
                      value={row.notes}
                      onChange={(e) =>
                        updateRow(row.key, { notes: e.target.value })
                      }
                      disabled={!canManage}
                      placeholder="Optional"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setRows((current) => [...current, emptyRow()])}
              >
                <Plus className="size-4" />
                Add stop
              </Button>
              <Button
                type="button"
                className="w-full sm:flex-1"
                disabled={saveMutation.isPending}
                onClick={handleSave}
              >
                {saveMutation.isPending ? "Saving…" : "Save stops"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}
