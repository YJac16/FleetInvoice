"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { recordManualBoarding } from "@/services/attendance.service";
import { listEmployees } from "@/services/employees.service";
import { listTrips } from "@/services/trips.service";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

type ManualBoardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  defaultTripId?: string | null;
  onRecorded: () => void;
};

export function ManualBoardingDialog({
  open,
  onOpenChange,
  organisationId,
  defaultTripId,
  onRecorded,
}: ManualBoardingDialogProps) {
  const [tripId, setTripId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setTripId("");
      setEmployeeId("");
      setNotes("");
      return;
    }
    if (defaultTripId) setTripId(defaultTripId);
  }, [open, defaultTripId]);

  const tripsQuery = useQuery({
    queryKey: queryKeys.trips(organisationId),
    queryFn: () => listTrips(organisationId),
    enabled: open,
  });

  const employeesQuery = useQuery({
    queryKey: queryKeys.employees(organisationId),
    queryFn: () => listEmployees(organisationId),
    enabled: open,
  });

  const trips = useMemo(
    () =>
      (tripsQuery.data ?? []).filter((t) =>
        ["planned", "assigned", "in_progress"].includes(t.status)
      ),
    [tripsQuery.data]
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!tripId) throw new Error("Select a trip");
      if (!employeeId) throw new Error("Select an employee");
      return recordManualBoarding({
        organisationId,
        tripId,
        employeeId,
        notes: notes || "Manual boarding override",
      });
    },
    onSuccess: () => {
      toast.success("Manual boarding recorded");
      onRecorded();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record boarding manually"
      description="Use when QR or backup code cannot be scanned. Requires a reason."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Trip</Label>
          <Select value={tripId} onValueChange={(value) => setTripId(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select trip" />
            </SelectTrigger>
            <SelectContent>
              {trips.map((trip) => (
                <SelectItem key={trip.id} value={trip.id}>
                  {(trip.routes?.name ?? "Trip") +
                    " · " +
                    formatDateTime(trip.planned_start)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Employee</Label>
          <Select
            value={employeeId}
            onValueChange={(value) => setEmployeeId(value ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {(employeesQuery.data ?? []).map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-notes">Reason / notes</Label>
          <Textarea
            id="manual-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="QR unreadable, device failure, etc."
          />
        </div>
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="w-full"
        >
          {mutation.isPending ? "Saving…" : "Record boarding"}
        </Button>
      </div>
    </FormDialog>
  );
}
