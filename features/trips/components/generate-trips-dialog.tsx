"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
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
import { computeOccurrenceDates } from "@/features/trips/lib/generate";
import { listSchedules } from "@/services/schedules.service";
import { generateTrips } from "@/services/trips.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const ALL_SCHEDULES = "all";

type GenerateTripsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  onGenerated: () => void;
};

export function GenerateTripsDialog({
  open,
  onOpenChange,
  organisationId,
  onGenerated,
}: GenerateTripsDialogProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scheduleId, setScheduleId] = useState<string>(ALL_SCHEDULES);

  useEffect(() => {
    if (!open) {
      setFrom("");
      setTo("");
      setScheduleId(ALL_SCHEDULES);
    }
  }, [open]);

  const schedulesQuery = useQuery({
    queryKey: queryKeys.schedules(organisationId),
    queryFn: () => listSchedules(organisationId),
    enabled: open,
  });

  const schedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data]);

  const previewCount = useMemo(() => {
    if (!from || !to) return null;
    const selected =
      scheduleId === ALL_SCHEDULES
        ? schedules
        : schedules.filter((schedule) => schedule.id === scheduleId);
    return selected.reduce(
      (total, schedule) =>
        total + computeOccurrenceDates(from, to, schedule.days_of_week).length,
      0
    );
  }, [from, to, scheduleId, schedules]);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateTrips(
        organisationId,
        from,
        to,
        scheduleId === ALL_SCHEDULES ? null : scheduleId
      ),
    onSuccess: (count) => {
      toast.success(`Generated ${count} trip${count === 1 ? "" : "s"}`);
      onOpenChange(false);
      onGenerated();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate trips"
      description="Create planned trips for schedules within a date range."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Schedule</Label>
          <Select
            value={scheduleId}
            onValueChange={(value) => setScheduleId(value ?? ALL_SCHEDULES)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SCHEDULES}>All schedules</SelectItem>
              {schedules.map((schedule) => (
                <SelectItem key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {previewCount !== null ? (
          <p className="text-xs text-muted-foreground">
            Estimated {previewCount} occurrence{previewCount === 1 ? "" : "s"}{" "}
            in this range. Trips already generated for the same schedule and
            start time are skipped.
          </p>
        ) : null}

        <Button
          type="button"
          className="w-full"
          disabled={!from || !to || generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? "Generating…" : "Generate trips"}
        </Button>
      </div>
    </FormDialog>
  );
}
