"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { SelectField, TextField } from "@/components/forms/form-fields";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fuelPriceSchema,
  parsePositiveNumber,
  type FuelPriceValues,
} from "@/features/fuel/schemas/fuel-fillup";
import { needsPrice, slipDate } from "@/features/fuel/lib/fuel-pricing";
import {
  DEFAULT_FUEL_REGION,
  FUEL_REGIONS,
  FUEL_TYPES,
  fuelRegionLabel,
  fuelTypeLabel,
} from "@/lib/fuel/fuel-types";
import {
  backfillUnpricedFuelFillups,
  confirmFuelPrices,
  upsertOrgFuelPrice,
} from "@/services/fuel-prices.service";
import type { FuelFillup, FuelPrice } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

function PriceRows({ rows }: { rows: FuelPrice[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Fuel type</th>
            <th className="py-1 pr-3 font-medium">Region</th>
            <th className="py-1 pr-3 font-medium">Effective from</th>
            <th className="py-1 pr-3 font-medium">R / litre</th>
            <th className="py-1 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-1 pr-3">{fuelTypeLabel(p.fuel_type)}</td>
              <td className="py-1 pr-3">{fuelRegionLabel(p.region)}</td>
              <td className="py-1 pr-3">{p.effective_from}</td>
              <td className="py-1 pr-3 tabular-nums">{Number(p.price_per_litre).toFixed(4)}</td>
              <td className="py-1">{p.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Finance-only fuel price admin (/fuel). Confirm the cron's global pending
 * DMPR rates into this org with one click, enter a manual rate as fallback,
 * see the needs-price fills and opt in to pricing them (backfill).
 */
export function FuelPricesPanel({
  organisationId,
  prices,
  fills,
  canManage,
}: {
  organisationId: string;
  prices: FuelPrice[];
  fills: FuelFillup[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [backfillOpen, setBackfillOpen] = useState(false);

  const pendingGlobal = useMemo(
    () => prices.filter((p) => p.organisation_id === null && p.status === "pending"),
    [prices]
  );
  const orgRates = useMemo(
    () => prices.filter((p) => p.organisation_id === organisationId && p.status === "confirmed"),
    [prices, organisationId]
  );
  const unconfirmed = useMemo(() => {
    const have = new Set(orgRates.map((p) => `${p.fuel_type}|${p.region}|${p.effective_from}`));
    return pendingGlobal.filter((p) => !have.has(`${p.fuel_type}|${p.region}|${p.effective_from}`));
  }, [pendingGlobal, orgRates]);
  const unpriced = useMemo(() => fills.filter(needsPrice), [fills]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.fuelPrices(organisationId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.fuelFillups(organisationId) }),
    ]);
  };

  const confirm = useMutation({
    mutationFn: () => confirmFuelPrices(organisationId),
    onSuccess: async (n) => {
      toast.success(n > 0 ? `Confirmed ${n} rate${n === 1 ? "" : "s"} for this organisation` : "Nothing new to confirm");
      await refresh();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const backfill = useMutation({
    mutationFn: () => backfillUnpricedFuelFillups(organisationId),
    onSuccess: async (r) => {
      setBackfillOpen(false);
      toast.success(
        `Priced ${r.priced} fill-up${r.priced === 1 ? "" : "s"}; ${r.still_needs_price + r.skipped_no_fuel_type} still need a price`
      );
      await refresh();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const form = useForm<FuelPriceValues>({
    resolver: zodResolver(fuelPriceSchema),
    defaultValues: {
      fuel_type: "",
      region: DEFAULT_FUEL_REGION,
      effective_from: "",
      price_per_litre: "",
    },
  });
  const manual = useMutation({
    mutationFn: (v: FuelPriceValues) =>
      upsertOrgFuelPrice({
        organisationId,
        fuelType: v.fuel_type,
        region: v.region,
        effectiveFrom: v.effective_from,
        pricePerLitre: parsePositiveNumber(v.price_per_litre, "Price per litre"),
      }),
    onSuccess: async () => {
      toast.success("Rate saved and confirmed");
      form.reset({ ...form.getValues(), price_per_litre: "" });
      await refresh();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="fuel-prices-panel">
      <Card>
        <CardHeader>
          <CardTitle>Fuel rates</CardTitle>
          <CardDescription>
            Fill-ups are priced from this organisation&apos;s confirmed rate in
            force on the slip date. Official DMPR rates arrive as pending and
            are never used until confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                Pending official rates{" "}
                {unconfirmed.length > 0 ? <Badge variant="secondary">{unconfirmed.length} to confirm</Badge> : null}
              </h3>
              {canManage ? (
                <Button
                  size="sm"
                  onClick={() => confirm.mutate()}
                  disabled={confirm.isPending || unconfirmed.length === 0}
                >
                  {confirm.isPending ? "Confirming…" : "Confirm pending rates"}
                </Button>
              ) : null}
            </div>
            <PriceRows rows={unconfirmed} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Confirmed rates (this organisation)</h3>
            <PriceRows rows={orgRates} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Enter a rate manually</CardTitle>
              <CardDescription>
                Fallback when the official release could not be read. Saved as
                confirmed for this organisation only. A rate that has already
                priced fill-ups is locked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={form.handleSubmit((v) => manual.mutate(v))}
              >
                <SelectField control={form.control} name="fuel_type" label="Fuel type" options={[...FUEL_TYPES]} />
                <SelectField control={form.control} name="region" label="Region" options={[...FUEL_REGIONS]} />
                <TextField control={form.control} name="effective_from" label="Effective from" type="date" />
                <TextField control={form.control} name="price_per_litre" label="Price per litre (R)" type="number" />
                <Button type="submit" className="sm:col-span-2" disabled={manual.isPending}>
                  {manual.isPending ? "Saving…" : "Save rate"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>
              Needs price{" "}
              <Badge variant={unpriced.length > 0 ? "destructive" : "secondary"}>{unpriced.length}</Badge>
            </CardTitle>
            <CardDescription>
              No confirmed rate on the slip date. Money stays empty (not R0)
              and these fills are left out of totals and invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unpriced.length === 0 ? (
              <p className="text-sm text-muted-foreground">All fill-ups are priced.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {unpriced.map((f) => (
                  <li key={f.id} className="flex flex-wrap justify-between gap-2 border-t pt-1">
                    <span>
                      {slipDate(f.filled_at)} · {f.vehicles?.name ?? f.vehicle_id.slice(0, 8)}
                    </span>
                    <span className="text-muted-foreground">
                      {fuelTypeLabel(f.fuel_type)} · {f.litres} L
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={unpriced.length === 0 || backfill.isPending}
                onClick={() => setBackfillOpen(true)}
              >
                Price unpriced fill-ups
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        title="Price unpriced fill-ups?"
        description="Fill-ups marked Needs price are priced at this organisation's confirmed rate for their slip date and then locked. Fills that still have no rate stay unpriced. Already-priced fill-ups are never changed."
        confirmLabel="Price fill-ups"
        loading={backfill.isPending}
        onConfirm={() => backfill.mutate()}
      />
    </div>
  );
}
