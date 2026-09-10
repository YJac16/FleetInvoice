"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { isVerifiedDestination } from "@/features/areas/lib/destination";
import { isInsideRadius } from "@/features/dispatch/lib/geofence";
import { calcTotalKm } from "@/features/driver-portal/lib/km";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import { listAreas } from "@/services/areas.service";
import type { Area, StaffTrip } from "@/types";
import { queryKeys } from "@/utils/query";

type EndTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string | null;
  trip: StaffTrip | null;
  loading?: boolean;
  onConfirm: (closingKm: number, areaId: string) => void;
};

export function EndTripDialog({
  open,
  onOpenChange,
  organisationId,
  trip,
  loading,
  onConfirm,
}: EndTripDialogProps) {
  const [closingKm, setClosingKm] = useState("");
  const [areaId, setAreaId] = useState("");
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);

  const areasQuery = useQuery({
    queryKey: organisationId ? queryKeys.areas(organisationId) : ["areas", "none"],
    queryFn: () => listAreas(organisationId!),
    enabled: Boolean(organisationId) && open,
  });
  const areas = useMemo(
    () => (areasQuery.data ?? []).filter(isVerifiedDestination),
    [areasQuery.data]
  );

  useEffect(() => {
    if (!open) {
      setClosingKm("");
      setAreaId("");
      setGpsWarning(null);
      return;
    }
    setAreaId(trip?.area_id ?? "");
  }, [open, trip?.area_id]);

  const totalKm = useMemo(() => {
    if (!trip?.opening_km || !closingKm.trim()) return null;
    return calcTotalKm(trip.opening_km, Number.parseFloat(closingKm));
  }, [trip?.opening_km, closingKm]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  const selected: Area | undefined = areas.find((a) => a.id === areaId);
  const opening = trip?.opening_km ?? null;
  const closingNum = closingKm.trim() ? Number.parseFloat(closingKm) : null;
  const valid =
    opening != null &&
    closingNum != null &&
    Number.isFinite(closingNum) &&
    closingNum >= opening &&
    Boolean(areaId);

  function confirm() {
    if (closingNum == null || !areaId) return;
    const finish = () => onConfirm(closingNum, areaId);
    if (
      !selected ||
      selected.lat == null ||
      selected.lng == null ||
      !navigator.geolocation
    ) {
      finish();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const inside = isInsideRadius(
          pos.coords.latitude,
          pos.coords.longitude,
          selected.lat!,
          selected.lng!,
          selected.radius_m ?? 150
        );
        if (!inside) {
          const message =
            "You appear to be outside this area’s geofence. Completing anyway — admin can correct the destination later.";
          setGpsWarning(message);
          toast.warning(message);
        } else {
          setGpsWarning(null);
        }
        finish();
      },
      () => finish(),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 15_000 }
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="End trip"
      description="Pick the destination area and enter closing odometer to complete the waybill."
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={loading || !valid}
            onClick={confirm}
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
          <Label>Destination area</Label>
          <Select value={areaId} onValueChange={(v) => setAreaId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select area" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        {gpsWarning ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">{gpsWarning}</p>
        ) : null}
      </div>
    </FormDialog>
  );
}
