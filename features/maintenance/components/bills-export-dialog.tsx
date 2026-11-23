"use client";

import { Download } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BillExportOptions } from "@/features/maintenance/types";
import { todayInListTz } from "@/lib/date-range/sast-range";

export const BILLS_EXPORT_ENDPOINT = "/api/maintenance/bills/export";

export type ExportDialogValues = { from: string; to: string; vehicle: string; supplier: string };

/** Query string for the export route. Only the filters go in; the org is
 *  always taken from the session server-side. */
export function buildBillsExportUrl(values: ExportDialogValues): string {
  const params = new URLSearchParams({ from: values.from, to: values.to });
  if (values.vehicle) params.set("vehicle", values.vehicle);
  if (values.supplier) params.set("supplier", values.supplier);
  return `${BILLS_EXPORT_ENDPOINT}?${params.toString()}`;
}

export function exportErrorMessage(body: { error?: string; fieldErrors?: Record<string, string> }): string {
  switch (body.error) {
    case "invalid_filters":
      return Object.values(body.fieldErrors ?? {})[0] ?? "Check the export filters.";
    case "too_many_rows":
      return "Too many bill lines for one file. Choose a shorter date range.";
    case "unauthenticated":
      return "Please sign in again.";
    case "forbidden":
    case "no_active_org":
    case "module_not_entitled":
      return "You don't have access to export maintenance bills.";
    default:
      return "Couldn't export bills. Please try again.";
  }
}

function filenameFrom(disposition: string | null): string {
  const m = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  return m?.[1] ?? "workshop-bills.csv";
}

const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function BillsExportDialog({ options }: { options: BillExportOptions }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<ExportDialogValues>(() => {
    const today = todayInListTz();
    return { from: `${today.slice(0, 8)}01`, to: today, vehicle: "", supplier: "" };
  });
  const set = (key: keyof ExportDialogValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(buildBillsExportUrl(values), { method: "GET", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string> };
        toast.error(exportErrorMessage(body));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFrom(res.headers.get("Content-Disposition"));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch {
      toast.error(exportErrorMessage({}));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        <Download className="size-4" /> Export CSV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export workshop bills</DialogTitle>
            <DialogDescription>One row per bill line, using the amounts as captured.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-from`}>From</Label>
                <Input id={`${id}-from`} type="date" className="h-10" value={values.from} onChange={set("from")} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-to`}>To</Label>
                <Input id={`${id}-to`} type="date" className="h-10" value={values.to} onChange={set("to")} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-vehicle`}>Vehicle</Label>
              <select id={`${id}-vehicle`} className={selectClass} value={values.vehicle} onChange={set("vehicle")}>
                <option value="">All vehicles</option>
                {options.vehicles.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-supplier`}>Supplier</Label>
              <select id={`${id}-supplier`} className={selectClass} value={values.supplier} onChange={set("supplier")}>
                <option value="">All suppliers</option>
                {options.suppliers.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy || !values.from || !values.to}>
                <Download className="size-4" /> {busy ? "Exporting…" : "Download CSV"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
