"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PricingStatusBadge } from "@/features/pricing/components/pricing-status-badge";
import { TripStatusBadge } from "@/features/trips/components/trip-status-badge";
import { ROUTES } from "@/lib/constants";
import { formatTripTime } from "@/lib/trips/filters";
import { formatRuleLabel } from "@/lib/pricing/engine";
import {
  approveTrip,
  overrideTripPrice,
} from "@/services/admin-trips.service";
import type {
  AdminTripWithDetails,
  PricingHistory,
} from "@/types/database";
import { formatRand } from "@/utils/currency";

interface AdminTripDetailClientProps {
  trip: AdminTripWithDetails;
  history: PricingHistory[];
}

export function AdminTripDetailClient({
  trip,
  history,
}: AdminTripDetailClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newPrice, setNewPrice] = useState(
    trip.calculated_price !== null ? String(trip.calculated_price) : ""
  );
  const [reason, setReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  function onApprove() {
    startTransition(async () => {
      const result = await approveTrip(trip.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Approved");
      router.refresh();
    });
  }

  function onOverride() {
    const price = Number(newPrice);
    if (Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("A reason is required");
      return;
    }

    startTransition(async () => {
      const result = await overrideTripPrice(trip.id, {
        newPrice: price,
        reason: reason.trim(),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Price overridden");
      setShowOverride(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trip pricing"
        description="Admins see calculated prices. Drivers never do."
        actions={
          <Button
            render={<Link href={ROUTES.trips} />}
            variant="outline"
          >
            Back to trips
          </Button>
        }
      />

      {trip.pricing_status === "needs_pricing" ? (
        <div className="flex gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-800 dark:text-orange-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Needs pricing</p>
            <p>
              No matching rule was found when this trip was saved. Create a
              pricing rule, then ask the driver to edit the pending trip (or
              override the price manually).
            </p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Date" value={trip.trip_date} />
        <Detail label="Time" value={formatTripTime(trip.trip_time)} />
        <Detail label="Company" value={trip.company_name} />
        <Detail label="Driver" value={trip.driver_name} />
        <Detail label="Passengers" value={String(trip.passengers)} />
        <Detail label="Vehicle" value={trip.vehicle_label} />
        <Detail label="Pickup" value={trip.pickup_area} />
        <Detail label="Destination" value={trip.destination_area} />
        <Detail
          label="Areas visited"
          value={
            trip.areas_visited.length > 0
              ? trip.areas_visited.join(", ")
              : "—"
          }
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Trip status</p>
          <TripStatusBadge status={trip.status} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Pricing status</p>
          <PricingStatusBadge status={trip.pricing_status} />
        </div>
        <Detail
          label="Pricing rule used"
          value={formatRuleLabel(trip.pricing_rule_id)}
        />
        <Detail
          label="Hidden calculated price"
          value={formatRand(trip.calculated_price)}
        />
        <Detail
          label="Price locked"
          value={trip.price_locked ? "Yes" : "No"}
        />
        <Detail
          label="Price calculated at"
          value={
            trip.price_calculated_at
              ? new Date(trip.price_calculated_at).toLocaleString()
              : "—"
          }
        />
      </section>

      <div className="flex flex-wrap gap-2">
        {trip.status === "pending" ? (
          <Button type="button" onClick={onApprove} disabled={pending}>
            Approve & lock price
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowOverride((open) => !open)}
        >
          Manual price override
        </Button>
      </div>

      {showOverride ? (
        <section className="space-y-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="flex gap-2 text-sm text-purple-800 dark:text-purple-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Warning: overriding replaces the calculated price. A reason is
              required and will be stored in pricing history.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="override-price">New price (ZAR)</Label>
              <Input
                id="override-price"
                type="number"
                min={0}
                step="0.01"
                value={newPrice}
                onChange={(event) => setNewPrice(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea
                id="override-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this price being overridden?"
                rows={3}
              />
            </div>
          </div>
          <Button type="button" onClick={onOverride} disabled={pending}>
            {pending ? "Saving…" : "Confirm override"}
          </Button>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Price history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No manual overrides recorded for this trip.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Old</th>
                  <th className="px-3 py-2 font-medium">New</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {new Date(row.changed_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{formatRand(row.old_price)}</td>
                    <td className="px-3 py-2">{formatRand(row.new_price)}</td>
                    <td className="px-3 py-2">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
