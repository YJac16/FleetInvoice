"use client";

import { useState } from "react";

import type { AppRole } from "@/lib/constants";

type Option = { role: AppRole; label: string };

export function DemoRoleSwitcherPanel({
  options,
  currentEmail,
}: {
  options: Option[];
  currentEmail: string;
}) {
  const [role, setRole] = useState<AppRole>(options[0]?.role ?? "organisation_admin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSwitch() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok || !json.redirectTo) {
        setError(json.error ?? "Switch failed");
        setPending(false);
        return;
      }
      window.location.assign(json.redirectTo);
    } catch {
      setError("Switch failed");
      setPending(false);
    }
  }

  return (
    <div
      data-testid="demo-role-switcher"
      className="fixed right-3 bottom-3 z-[100] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-lg border border-amber-500 bg-background/95 p-2 text-xs shadow-lg backdrop-blur"
    >
      <span className="rounded bg-amber-500 px-1.5 py-0.5 font-bold tracking-wide text-black">
        DEMO
      </span>
      <span className="hidden text-muted-foreground sm:inline" title={currentEmail}>
        Viewing as
      </span>
      <label className="sr-only" htmlFor="demo-role-select">
        Demo role
      </label>
      <select
        id="demo-role-select"
        className="h-7 rounded border border-border bg-background px-1"
        value={role}
        onChange={(e) => setRole(e.target.value as AppRole)}
        disabled={pending}
      >
        {options.map((o) => (
          <option key={o.role} value={o.role}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="h-7 rounded bg-primary px-2 font-medium text-primary-foreground disabled:opacity-60"
        onClick={onSwitch}
        disabled={pending}
      >
        {pending ? "Switching…" : "Switch"}
      </button>
      {error ? <span className="w-full text-destructive">{error}</span> : null}
    </div>
  );
}
