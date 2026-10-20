"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { formatVehicleOptionLabel } from "@/features/trips/lib/staff-waybill-form";
import { listActiveCompanies } from "@/services/companies.service";
import { listDrivers } from "@/services/drivers.service";
import { adminCreateStaffTrip } from "@/services/trip-admin.service";
import { listVehicles } from "@/services/vehicles.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

type AdminManualTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  onCreated: () => void;
};

export function AdminManualTripDialog({
  open,
  onOpenChange,
  organisationId,
  onCreated,
}: AdminManualTripDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("08:00");
  const [driverId, setDriverId] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [pax, setPax] = useState("1");
  const [vehicleId, setVehicleId] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [markCompleted, setMarkCompleted] = useState(true);

  const driversQuery = useQuery({
    queryKey: queryKeys.drivers(organisationId),
    queryFn: () => listDrivers(organisationId),
    enabled: open,
  });

  const companiesQuery = useQuery({
    queryKey: queryKeys.companies(organisationId),
    queryFn: () => listActiveCompanies(organisationId),
    enabled: open,
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(organisationId),
    queryFn: () => listVehicles(organisationId),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      adminCreateStaffTrip({
        organisationId,
        driverId,
        date,
        time,
        pickup,
        dropoff,
        companyId,
        paxCount: Number(pax),
        vehicleId,
        totalKm: Number(km),
        notes,
        markCompleted,
      }),
    onSuccess: (result) => {
      if (result.duplicateWarning) {
        toast.warning("Trip created — a similar trip exists within 45 minutes.");
      } else {
        toast.success(markCompleted ? "Trip created and invoiced" : "Trip created");
      }
      onOpenChange(false);
      onCreated();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create trip manually"
      description="Same fields as the driver log form. Not flagged as a driver submission."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating…" : "Create trip"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Driver</Label>
          <Select
            value={driverId}
            onValueChange={(v) => setDriverId(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select driver" />
            </SelectTrigger>
            <SelectContent>
              {(driversQuery.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Company</Label>
          <Select
            value={companyId}
            onValueChange={(v) => setCompanyId(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {(companiesQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Pickup</Label>
            <Input value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Drop-off</Label>
            <Input value={dropoff} onChange={(e) => setDropoff(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Pax</Label>
            <Input
              type="number"
              min={0}
              value={pax}
              onChange={(e) => setPax(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Km</Label>
            <Input
              type="number"
              min={0}
              value={km}
              onChange={(e) => setKm(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Vehicle</Label>
          <Select
            value={vehicleId}
            onValueChange={(v) => setVehicleId(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select vehicle" />
            </SelectTrigger>
            <SelectContent>
              {(vehiclesQuery.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {formatVehicleOptionLabel(v.registration_number, v.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={markCompleted}
            onChange={(e) => setMarkCompleted(e.target.checked)}
          />
          Mark completed and sync draft invoice line
        </label>
      </div>
    </FormDialog>
  );
}
