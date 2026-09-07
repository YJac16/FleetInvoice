"use client";

import { useState } from "react";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import type { StaffTrip } from "@/types";

type StartTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: StaffTrip | null;
  loading?: boolean;
  onConfirm: (openingKm: number, waybillConfirmed: boolean) => void;
};

export function StartTripDialog({
  open,
  onOpenChange,
  trip,
  loading,
  onConfirm,
}: StartTripDialogProps) {
  const [openingKm, setOpeningKm] = useState("");
  const [waybillConfirmed, setWaybillConfirmed] = useState(true);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setOpeningKm("");
      setWaybillConfirmed(true);
    }
    onOpenChange(next);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Start trip"
      description="Confirm waybill details and enter opening odometer to go en route to pickup."
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={loading || !openingKm.trim() || !waybillConfirmed}
            onClick={() =>
              onConfirm(Number.parseFloat(openingKm), waybillConfirmed)
            }
          >
            {loading ? "Starting…" : "Start trip"}
          </Button>
        </>
      }
    >
      {trip ? <StaffTripCard trip={trip} compact className="mb-4" /> : null}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Checkbox
            id="waybill-confirmed"
            checked={waybillConfirmed}
            onCheckedChange={(v) => setWaybillConfirmed(Boolean(v))}
          />
          <Label htmlFor="waybill-confirmed" className="text-sm leading-snug">
            I confirm company, time, area and pax match the waybill
          </Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="opening-km">Opening km</Label>
          <Input
            id="opening-km"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            placeholder="e.g. 12450"
            value={openingKm}
            onChange={(e) => setOpeningKm(e.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  );
}
