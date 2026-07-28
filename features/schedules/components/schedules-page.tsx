"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar } from "lucide-react";
import { useMemo } from "react";
import { Controller, useForm, type Control } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  FieldShell,
  SelectField,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  scheduleSchema,
  type ScheduleValues,
} from "@/features/schedules/schemas/schedule";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  DAYS_OF_WEEK,
  DAY_OF_WEEK_SHORT_LABELS,
  ENTITY_STATUSES,
  STATUS_LABELS,
} from "@/lib/constants";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  restoreSchedule,
  updateSchedule,
} from "@/services/schedules.service";
import type { Schedule } from "@/types";
import { queryKeys } from "@/utils/query";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normaliseTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function DaysOfWeekField({ control }: { control: Control<ScheduleValues> }) {
  return (
    <Controller
      control={control}
      name="days_of_week"
      render={({ field, fieldState }) => (
        <FieldShell label="Days of week" error={fieldState.error?.message}>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => {
              const checked = field.value?.includes(day) ?? false;
              return (
                <label
                  key={day}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      const current = new Set(field.value ?? []);
                      if (value) current.add(day);
                      else current.delete(day);
                      field.onChange(
                        Array.from(current).sort((a, b) => a - b)
                      );
                    }}
                  />
                  {DAY_OF_WEEK_SHORT_LABELS[day]}
                </label>
              );
            })}
          </div>
        </FieldShell>
      )}
    />
  );
}

function ScheduleForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: Schedule;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { routes } = useEntityOptions(organisationId, { includeRoutes: true });
  const form = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      route_id: initial?.route_id ?? "",
      name: initial?.name ?? "",
      days_of_week: initial?.days_of_week ?? [],
      depart_time: initial?.depart_time?.slice(0, 5) ?? "",
      effective_from: initial?.effective_from ?? "",
      effective_to: initial?.effective_to ?? "",
      timezone: initial?.timezone ?? "UTC",
      status: initial?.status ?? "active",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          route_id: values.route_id,
          name: values.name.trim(),
          days_of_week: values.days_of_week,
          depart_time: normaliseTime(values.depart_time),
          effective_from: values.effective_from,
          effective_to: emptyToNull(values.effective_to),
          timezone: values.timezone.trim() || "UTC",
          status: values.status,
        })
      )}
    >
      <SelectField
        control={form.control}
        name="route_id"
        label="Route"
        options={routes}
      />
      <TextField control={form.control} name="name" label="Name" />
      <DaysOfWeekField control={form.control} />
      <TextField
        control={form.control}
        name="depart_time"
        label="Depart time"
        type="time"
      />
      <TextField
        control={form.control}
        name="effective_from"
        label="Effective from"
        type="date"
      />
      <TextField
        control={form.control}
        name="effective_to"
        label="Effective to"
        type="date"
        placeholder="Optional"
      />
      <TextField control={form.control} name="timezone" label="Timezone" />
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

export function SchedulesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("schedules:manage");
  const { routes } = useEntityOptions(organisationId, { includeRoutes: true });
  const routeNameById = useMemo(
    () => new Map(routes.map((route) => [route.value, route.label])),
    [routes]
  );

  const columns = useMemo<ColumnDef<Schedule, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "route_id",
        header: "Route",
        cell: ({ row }) =>
          routeNameById.get(row.original.route_id) ?? row.original.route_id,
      },
      {
        accessorKey: "days_of_week",
        header: "Days",
        cell: ({ row }) =>
          row.original.days_of_week
            .slice()
            .sort((a, b) => a - b)
            .map((day) => DAY_OF_WEEK_SHORT_LABELS[day as keyof typeof DAY_OF_WEEK_SHORT_LABELS])
            .join(", "),
      },
      { accessorKey: "depart_time", header: "Depart time" },
      { accessorKey: "effective_from", header: "From" },
      { accessorKey: "effective_to", header: "To" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [routeNameById]
  );

  return (
    <EntityCrudPage<Schedule>
      title="Schedules"
      description="Manage recurring departure schedules for routes."
      organisationId={organisationId}
      queryKey={
        organisationId
          ? queryKeys.schedules(organisationId)
          : ["schedules", "none"]
      }
      columns={columns}
      list={listSchedules}
      create={
        canManage
          ? (orgId, values) =>
              createSchedule(
                orgId,
                values as Parameters<typeof createSchedule>[1]
              )
          : undefined
      }
      update={
        canManage
          ? (id, values) =>
              updateSchedule(id, values as Parameters<typeof updateSchedule>[1])
          : undefined
      }
      remove={canManage ? deleteSchedule : undefined}
      restore={canManage ? restoreSchedule : undefined}
      canManage={canManage}
      searchFilter={(row, query) =>
        [row.name, routeNameById.get(row.route_id)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      }
      emptyIcon={Calendar}
      createLabel="Add schedule"
      renderForm={({ initial, onSubmit, submitting }) => (
        <ScheduleForm
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

