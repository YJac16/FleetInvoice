"use client";

import { useMemo, useState } from "react";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcTotalKm } from "@/features/driver-portal/lib/km";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import type { StaffTrip } from "@/types";

type EndTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: StaffTrip | null;
  loading?: boolean;
  onConfirm: (closingKm: number) => void;
};

export function EndTripDialog({
  open,
  onOpenChange,
  trip,
  loading,
  onConfirm,
}: EndTripDialogProps) {
  const [closingKm, setClosingKm] = useState("");

  const totalKm = useMemo(() => {
    if (!trip?.opening_km || !closingKm.trim()) return null;
    return calcTotalKm(trip.opening_km, Number.parseFloat(closingKm));
  }, [trip?.opening_km, closingKm]);

  function handleOpenChange(next: boolean) {
    if (!next) setClosingKm("");
    onOpenChange(next);
  }

  const opening = trip?.opening_km ?? null;
  const closingNum = closingKm.trim() ? Number.parseFloat(closingKm) : null;
  const valid =
    opening != null &&
    closingNum != null &&
    Number.isFinite(closingNum) &&
    closingNum >= opening;

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="End trip"
      description="Enter closing odometer reading to complete the trip."
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={loading || !valid}
            onClick={() => closingNum != null && onConfirm(closingNum)}
          >
            {loading ? "Completing…" : "Complete trip"}
          </Button>
        </>
      }
    >
      {trip ? <StaffTripCard trip={trip} compact className="mb-4" /> : null}
      <div className="space-y-4">
        {opening != null ? (
          <p className="text-sm text-muted-foreground">
            Opening km: <span className="font-medium text-foreground">{opening}</span>
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="closing-km">Closing km</Label>
          <Input
            id="closing-km"
            type="number"
            inputMode="decimal"
            min={opening ?? 0}
            step={0.1}
            placeholder="e.g. 12478"
            value={closingKm}
            onChange={(e) => setClosingKm(e.target.value)}
          />
        </div>
        {totalKm != null ? (
          <p className="text-sm">
            Total distance:{" "}
            <span className="font-semibold">{totalKm} km</span>
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}
