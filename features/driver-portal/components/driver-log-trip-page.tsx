"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
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
import {
  DRIVER_DATETIME_INPUT,
  DRIVER_PAIR_CELL,
  DRIVER_PAIR_GRID,
  DRIVER_PAIR_GRID_STACK,
} from "@/features/driver-portal/lib/driver-form-layout";
import { submitDriverTrip } from "@/services/driver-submitted-trips.service";
import { listActiveCompanies } from "@/services/companies.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

export function DriverLogTripPage() {
  const { can } = useOrg();
  const router = useRouter();
  const organisationId = useActiveOrgId();
  const canSelf = can("trips:self");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("08:00");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [pax, setPax] = useState("1");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");

  const companiesQuery = useQuery({
    queryKey: organisationId ? queryKeys.companies(organisationId) : ["companies", "none"],
    queryFn: () => listActiveCompanies(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submitDriverTrip({
        organisationId: organisationId!,
        date,
        time,
        pickup,
        dropoff,
        companyId,
        paxCount: Number(pax),
        totalKm: Number(km),
        notes,
      }),
    onSuccess: (result) => {
      if (result.duplicateWarning) {
        toast.warning(
          "Submitted — a similar trip (same window, company or driver, and route) already exists."
        );
      } else {
        toast.success("Trip submitted for approval");
      }
      router.push("/driver/submissions");
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (!canSelf || !organisationId) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to log trips.
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Log a trip</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An admin assigns the vehicle when approving. Rate card applies after approval.
        </p>
      </div>

      <form
        className="min-w-0 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitMutation.mutate();
        }}
      >
        <div className={DRIVER_PAIR_GRID_STACK}>
          <div className={DRIVER_PAIR_CELL}>
            <Label htmlFor="log-date">Date</Label>
            <Input
              id="log-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={DRIVER_DATETIME_INPUT}
              required
            />
          </div>
          <div className={DRIVER_PAIR_CELL}>
            <Label htmlFor="log-time">Time</Label>
            <Input
              id="log-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={DRIVER_DATETIME_INPUT}
              required
            />
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="log-pickup">Pickup</Label>
          <Input
            id="log-pickup"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            className="w-full min-w-0"
            required
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="log-dropoff">Drop-off</Label>
          <Input
            id="log-dropoff"
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            className="w-full min-w-0"
            required
          />
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="log-company">Company</Label>
          <Select
            value={companyId}
            onValueChange={(value) => setCompanyId(value ?? "")}
            required
          >
            <SelectTrigger id="log-company" className="w-full min-w-0 max-w-full">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {(companiesQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={DRIVER_PAIR_GRID}>
          <div className={DRIVER_PAIR_CELL}>
            <Label htmlFor="log-pax">Pax</Label>
            <Input
              id="log-pax"
              type="number"
              min={0}
              value={pax}
              onChange={(e) => setPax(e.target.value)}
              className="w-full min-w-0"
              required
            />
          </div>
          <div className={DRIVER_PAIR_CELL}>
            <Label htmlFor="log-km">Km</Label>
            <Input
              id="log-km"
              type="number"
              min={0}
              step="0.1"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className="w-full min-w-0"
              required
            />
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="log-notes">Notes</Label>
          <Textarea
            id="log-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px] w-full min-w-0"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          You do not choose a vehicle here — that happens during admin approval.
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="submit"
            className="w-full"
            disabled={submitMutation.isPending}
          >
            Submit for approval
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            render={<Link href="/driver/submissions">My submissions</Link>}
          />
        </div>
      </form>
    </div>
  );
}
