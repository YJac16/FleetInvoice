"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { combinedTotals, type OwnerSplitRow } from "@/features/reports/lib/owner-split";
import { OWNER_LABELS } from "@/lib/owner-tag";

export type OwnerSplitMetric = "count" | "litres" | "amount" | "issued" | "paid";

const METRIC_LABELS: Record<OwnerSplitMetric, string> = {
  count: "Count",
  litres: "Litres",
  amount: "Total",
  issued: "Issued",
  paid: "Paid",
};

function fmt(metric: OwnerSplitMetric, value: number): string {
  return metric === "count" ? String(value) : value.toFixed(2);
}

/**
 * Owner subtotals (Yaseen, Fadia, Unassigned when non-zero) with a
 * "Combined view" switch. Split is the default; combined shows one All line
 * (All = Yaseen + Fadia + Unassigned).
 */
export function OwnerSplitPanel({
  split,
  metrics,
  combined,
  onCombinedChange,
  countLabel = "Count",
}: {
  split: OwnerSplitRow[];
  metrics: OwnerSplitMetric[];
  combined: boolean;
  onCombinedChange: (combined: boolean) => void;
  countLabel?: string;
}) {
  const total = combinedTotals(split);
  const label = (m: OwnerSplitMetric) => (m === "count" ? countLabel : METRIC_LABELS[m]);
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Owner totals">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-lg">{combined ? "Combined totals" : "Split by owner"}</h3>
        <div className="flex items-center gap-2">
          <Switch
            id="owner-combined-view"
            checked={combined}
            onCheckedChange={(checked) => onCombinedChange(Boolean(checked))}
          />
          <Label htmlFor="owner-combined-view">Combined view</Label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-4 font-medium">Owner</th>
              {metrics.map((m) => (
                <th key={m} className="py-1 pr-4 text-right font-medium">
                  {label(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {combined
              ? null
              : split.map((row) => (
                  <tr key={row.owner} className="border-t" data-owner-row={row.owner}>
                    <td className="py-1 pr-4">{OWNER_LABELS[row.owner]}</td>
                    {metrics.map((m) => (
                      <td key={m} className="py-1 pr-4 text-right tabular-nums">
                        {fmt(m, row[m])}
                      </td>
                    ))}
                  </tr>
                ))}
            <tr className="border-t font-medium" data-owner-row="all">
              <td className="py-1 pr-4">All</td>
              {metrics.map((m) => (
                <td key={m} className="py-1 pr-4 text-right tabular-nums">
                  {fmt(m, total[m])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
