"use client";

import { useId, useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  slipDate,
  vehicleFuelHistory,
} from "@/features/fuel/lib/fuel-pricing";
import { fuelTypeLabel } from "@/lib/fuel/fuel-types";
import type { FuelFillup, FuelPrice } from "@/types";

const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const rand = (n: number | null | undefined, dp = 2) =>
  n == null ? "—" : `R ${Number(n).toFixed(dp)}`;

/**
 * Finance-only vehicle fuel history: last locked purchase vs current confirmed
 * rate, cost/km and unit-price trend. (Profitability view is Drop 2.)
 */
export function VehicleFuelHistoryPanel({
  organisationId,
  fills,
  prices,
}: {
  organisationId: string;
  fills: FuelFillup[];
  prices: FuelPrice[];
}) {
  const id = useId();
  const vehicles = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fills) {
      if (!m.has(f.vehicle_id)) {
        m.set(f.vehicle_id, f.vehicles?.name ?? f.vehicles?.registration_number ?? f.vehicle_id.slice(0, 8));
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [fills]);
  const [vehicleId, setVehicleId] = useState("");
  const selected = vehicleId || vehicles[0]?.[0] || "";
  const today = slipDate(new Date());
  const h = useMemo(
    () => (selected ? vehicleFuelHistory(fills, selected, prices, organisationId, today) : null),
    [fills, selected, prices, organisationId, today]
  );

  return (
    <Card data-testid="vehicle-fuel-history">
      <CardHeader>
        <CardTitle>Vehicle fuel history</CardTitle>
        <CardDescription>
          Last locked purchase against the current confirmed rate, cost per km
          (amount ÷ km since the previous fill) and the price trend. Unpriced
          fills are left out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fill-ups yet.</p>
        ) : (
          <>
            <div className="max-w-sm space-y-1">
              <label htmlFor={`${id}-vehicle`} className="text-sm font-medium">
                Vehicle
              </label>
              <select
                id={`${id}-vehicle`}
                className={selectClass}
                value={selected}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                {vehicles.map(([vid, name]) => (
                  <option key={vid} value={vid}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {h ? (
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Last locked purchase</div>
                  {h.lastLocked ? (
                    <div>
                      {rand(h.lastLocked.unit_price, 4)}/L · {fuelTypeLabel(h.lastLocked.fuel_type)} ·{" "}
                      {slipDate(h.lastLocked.filled_at)}
                    </div>
                  ) : (
                    <div>None priced yet</div>
                  )}
                  <div className="mt-1 text-muted-foreground">Current confirmed rate</div>
                  <div>
                    {h.currentRate ? `${rand(h.currentRate.price_per_litre, 4)}/L (from ${h.currentRate.effective_from})` : "No confirmed rate"}
                    {h.rateDelta != null ? (
                      <span className="ml-1 text-muted-foreground">
                        ({h.rateDelta > 0 ? "+" : ""}
                        {h.rateDelta.toFixed(4)})
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Cost per km</div>
                  <div>{h.averageCostPerKm != null ? `${rand(h.averageCostPerKm, 2)}/km average` : "Not enough priced fills"}</div>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {h.costPerKm.slice(-5).map((c) => (
                      <li key={c.id}>
                        {slipDate(c.filled_at)}: {rand(c.costPerKm, 2)}/km over {c.km} km
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">
                    Unit price trend{" "}
                    {h.trendDirection ? (
                      <span aria-label={`trend ${h.trendDirection}`}>
                        {h.trendDirection === "up" ? "↑" : h.trendDirection === "down" ? "↓" : "→"}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {h.trend.slice(-6).map((t) => (
                      <li key={t.id}>
                        {slipDate(t.filled_at)}: {rand(t.unit_price, 4)}/L
                      </li>
                    ))}
                  </ul>
                  {h.needsPriceCount > 0 ? (
                    <div className="mt-1 text-xs text-muted-foreground">{h.needsPriceCount} fill(s) need a price</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
