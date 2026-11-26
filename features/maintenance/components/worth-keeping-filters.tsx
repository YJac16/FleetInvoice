"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OWNER_FILTERS, PERIOD_MONTHS } from "@/features/maintenance/lib/worth-keeping";

const OWNER_LABEL: Record<string, string> = { all: "All", yaseen: "Yaseen", fadia: "Fadia" };

export function WorthKeepingFilters({ months, owner }: { months: number; owner: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const select = "h-10 w-full rounded-lg border bg-background px-3 text-sm";
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
      <label className="space-y-1 text-xs text-muted-foreground">
        Period
        <select className={select} value={months} onChange={(e) => set("months", e.target.value)}>
          {PERIOD_MONTHS.map((m) => (
            <option key={m} value={m}>
              {m === 1 ? "Last month" : `Last ${m} months`}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Owner
        <select className={select} value={owner} onChange={(e) => set("owner", e.target.value)}>
          {OWNER_FILTERS.map((o) => (
            <option key={o} value={o}>
              {OWNER_LABEL[o]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
