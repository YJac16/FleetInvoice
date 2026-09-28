"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculatedTotal } from "@/features/fuel/lib/slip-math";
import { formatFilledAtSast, parseDecimalInput } from "@/features/fuel/lib/sast";
import { normalizeVrn } from "@/features/fuel/lib/vrn";
import { FUEL_TYPES, type FuelType } from "@/lib/fuel/constants";
import { prepareFuelSlipPhotoFile } from "@/lib/compliance/client/prepare-upload";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import { listFuelFillups } from "@/services/fuel-fillups.service";
import { listMyDriverTrips } from "@/services/trip-assignments.service";
import { listVehicles } from "@/services/vehicles.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

type VrnAction = "pending" | "confirmed_prefill" | "edited" | "not_shown";

export function DriverFuelSlipPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canSelf = can("fuel:self");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [clientEntryId] = useState(() => crypto.randomUUID());

  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [litres, setLitres] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("ulp95");
  const [odometer, setOdometer] = useState("");
  const [stationName, setStationName] = useState("");
  const [authNo, setAuthNo] = useState("");
  const [vrnAction, setVrnAction] = useState<VrnAction>("pending");
  const [slipVrn, setSlipVrn] = useState("");
  const [isFullTank, setIsFullTank] = useState(true);

  const vehiclesQuery = useQuery({
    queryKey: organisationId ? queryKeys.vehicles(organisationId) : ["vehicles", "none"],
    queryFn: () => listVehicles(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const tripsQuery = useQuery({
    queryKey: organisationId ? queryKeys.driverTrips(organisationId) : ["driver-trips", "none"],
    queryFn: () => listMyDriverTrips(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const fillupsQuery = useQuery({
    queryKey: organisationId ? queryKeys.fuelFillups(organisationId) : ["fuel", "none"],
    queryFn: () => listFuelFillups(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const selectedVehicle = useMemo(
    () => (vehiclesQuery.data ?? []).find((v) => v.id === vehicleId),
    [vehiclesQuery.data, vehicleId]
  );

  useEffect(() => {
    if (vehicleId || !vehiclesQuery.data?.length) return;
    const active =
      (tripsQuery.data ?? []).find((t) => t.status === "in_progress") ??
      (tripsQuery.data ?? []).find((t) => t.status === "assigned");
    const fromTrip = active?.trip_assignments?.find((a) => a.vehicle_id)?.vehicle_id;
    if (fromTrip) {
      setVehicleId(fromTrip);
      return;
    }
    setVehicleId(vehiclesQuery.data[0]!.id);
  }, [vehicleId, vehiclesQuery.data, tripsQuery.data]);

  useEffect(() => {
    if (vrnAction !== "pending" || !selectedVehicle?.registration_number) return;
    setSlipVrn(selectedVehicle.registration_number);
  }, [selectedVehicle?.registration_number, vrnAction]);

  const litresN = parseDecimalInput(litres);
  const priceN = parseDecimalInput(unitPrice);
  const totalN = parseDecimalInput(totalAmount);
  const calcHint =
    litresN != null && priceN != null
      ? calculatedTotal(litresN, priceN)
      : null;

  const vrnReady =
    vrnAction === "not_shown" ||
    (vrnAction === "confirmed_prefill" && slipVrn.trim().length > 0) ||
    (vrnAction === "edited" && slipVrn.trim().length > 0);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!organisationId || !photoFile || !vehicleId) {
        throw new Error("Missing required fields");
      }
      const prepared = await prepareFuelSlipPhotoFile(photoFile);
      const form = new FormData();
      form.set("organisation_id", organisationId);
      form.set("client_entry_id", clientEntryId);
      form.set("vehicle_id", vehicleId);
      form.set("filled_at_local_date", date);
      form.set("filled_at_local_time", time);
      form.set("litres", String(litresN));
      form.set("unit_price", String(priceN));
      form.set("total_amount", String(totalN));
      form.set("fuel_type", fuelType);
      form.set("slip_vrn_status", vrnAction === "pending" ? "confirmed_prefill" : vrnAction);
      form.set("slip_vrn", vrnAction === "not_shown" ? "" : slipVrn.toUpperCase());
      form.set("odometer_km", String(parseDecimalInput(odometer)));
      form.set("station_name", stationName);
      form.set("authorisation_no", authNo.toUpperCase());
      form.set("is_full_tank", String(isFullTank));
      form.set("photo", prepared);

      const res = await fetch("/api/fuel/slips", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "submit_failed");
      }
      return body;
    },
    onSuccess: () => {
      toast.success("Saved. Sent for admin review.");
      queryClient.invalidateQueries({ queryKey: queryKeys.fuelFillups(organisationId!) });
      setPhotoFile(null);
      setPhotoPreview(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  if (!canSelf) {
    return <p className="text-muted-foreground p-4">You do not have access to fuel slips.</p>;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24">
      <PageHeader title="Add fuel slip" description="Photograph the slip, then enter the printed details." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Photo of slip (required)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Lay the slip flat with good light. There is no skip option.
          </p>
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            className="min-h-12"
            onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
          />
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="Slip preview" className="max-h-48 w-full rounded-lg object-contain" />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Slip details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Vehicle</Label>
            <select
              className="mt-1 w-full min-h-12 rounded-md border bg-background px-3"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setVrnAction("pending");
              }}
            >
              {(vehiclesQuery.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {formatVehicleLabel(v)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Date</Label>
              <Input type="date" className="min-h-12" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" className="min-h-12" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Check the date on the slip. Many slips print year first: 26/09/27 means 27 Sep 2026.
          </p>
          <p className="text-sm font-medium">{formatFilledAtSast(new Date(`${date}T${time}:00`).toISOString())}</p>

          <div>
            <Label>Litres</Label>
            <Input inputMode="decimal" className="min-h-12" value={litres} onChange={(e) => setLitres(e.target.value)} />
          </div>
          <div>
            <Label>Price per litre (R)</Label>
            <Input inputMode="decimal" className="min-h-12" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <Label>Total on slip (R)</Label>
            <Input inputMode="decimal" className="min-h-12" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </div>
          {calcHint != null && totalN != null ? (
            <p className="text-sm text-muted-foreground">
              {litresN} × R{priceN} = R{calcHint.toFixed(2)}. Slip total R{totalN.toFixed(2)}.
              {Math.abs(calcHint - totalN) <= 1 ? " ✓ Looks right." : " ⚠ Check litres, price and total."}
            </p>
          ) : null}

          <div>
            <Label>Fuel type</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {FUEL_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={fuelType === t ? "default" : "outline"}
                  onClick={() => setFuelType(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <Label>VRN on slip</Label>
            <p className="text-sm mt-1">{slipVrn || "—"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setVrnAction("confirmed_prefill")}>
                ✓ Matches slip
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setVrnAction("edited");
                }}
              >
                ✎ Edit
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setVrnAction("not_shown")}>
                Not shown on slip
              </Button>
            </div>
            {vrnAction === "edited" ? (
              <Input
                className="mt-2 min-h-12 uppercase"
                value={slipVrn}
                onChange={(e) => setSlipVrn(e.target.value)}
              />
            ) : null}
            {selectedVehicle?.registration_number && vrnAction !== "not_shown" ? (
              <p className="text-xs text-muted-foreground mt-2">
                Vehicle VRN: {normalizeVrn(selectedVehicle.registration_number)}
              </p>
            ) : null}
          </div>

          <div>
            <Label>Odometer (km)</Label>
            <Input inputMode="numeric" className="min-h-12" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              If the slip does not show the odometer, enter the reading from the dashboard now.
            </p>
          </div>

          <div>
            <Label>Station name</Label>
            <Input className="min-h-12" value={stationName} onChange={(e) => setStationName(e.target.value)} />
          </div>

          <div>
            <Label>Authorisation no. (optional)</Label>
            <Input className="min-h-12 uppercase" value={authNo} onChange={(e) => setAuthNo(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 min-h-12">
            <input type="checkbox" checked={isFullTank} onChange={(e) => setIsFullTank(e.target.checked)} />
            Full tank
          </label>
        </CardContent>
      </Card>

      <Button
        className="sticky bottom-4 min-h-12 w-full"
        disabled={
          !photoFile ||
          !vrnReady ||
          !stationName.trim() ||
          litresN == null ||
          priceN == null ||
          totalN == null ||
          parseDecimalInput(odometer) == null ||
          submitMutation.isPending
        }
        onClick={() => submitMutation.mutate()}
      >
        Submit for review
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My fuel slips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(fillupsQuery.data ?? []).map((f) => (
            <div key={f.id} className="flex justify-between border-b py-2">
              <span>{f.station_name ?? "Fuel slip"}</span>
              <span className="text-muted-foreground">{(f as { review_status?: string }).review_status ?? "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
