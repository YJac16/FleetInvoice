"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveIntervalAction } from "@/features/maintenance/actions";
import type { IntervalRow } from "@/features/maintenance/lib/insights-queries";

function Row({ row }: { row: IntervalRow }) {
  const [km, setKm] = useState(row.interval_km?.toString() ?? "");
  const [months, setMonths] = useState(row.interval_months?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await saveIntervalAction(row.category_id, km, months);
      if (res.ok) toast.success("Interval saved");
      else toast.error(res.message);
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="text-sm font-medium">{row.category_name}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Every (km)
          <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Not set" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Every (months)
          <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="Not set" />
        </label>
      </div>
      <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </li>
  );
}

export function IntervalEditor({ rows }: { rows: IntervalRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a category on a bill line first.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <Row key={r.category_id} row={r} />
      ))}
    </ul>
  );
}
