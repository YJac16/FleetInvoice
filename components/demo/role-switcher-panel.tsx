"use client";

import { useEffect, useRef, useState } from "react";

import type { AppRole } from "@/lib/constants";
import type { AppModule } from "@/lib/entitlements";

type Option = {
  role: AppRole;
  label: string;
  requiresModule?: AppModule;
  unavailableLabel?: string;
};

export const DEMO_BAR_STORAGE_KEY = "demo-role-switcher:collapsed";
export const DEMO_BAR_HEIGHT_VAR = "--demo-bar-height";
const NARROW_VIEWPORT_PX = 640;

export function DemoRoleSwitcherPanel({
  options,
  currentEmail,
  currentRole,
  entitledModules,
}: {
  options: Option[];
  currentEmail: string;
  currentRole?: AppRole;
  /** Demo org's modules; omitted -> every option enabled. */
  entitledModules?: readonly AppModule[];
}) {
  const [role, setRole] = useState<AppRole>(
    currentRole ?? options[0]?.role ?? "organisation_admin"
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start compact (safe on every viewport, matches SSR); the stored or
  // viewport-based preference is applied after mount.
  const [collapsed, setCollapsed] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(DEMO_BAR_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    if (stored === "1" || stored === "0") setCollapsed(stored === "1");
    else setCollapsed(window.innerWidth < NARROW_VIEWPORT_PX);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(DEMO_BAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  // Reserve space equal to the bar's measured height so it never covers
  // interactive content at the bottom of the page.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const body = document.body;
    const prevPadding = body.style.paddingBottom;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      root.style.setProperty(DEMO_BAR_HEIGHT_VAR, `${h}px`);
      // 0.75rem = the bar's bottom offset.
      body.style.paddingBottom = `calc(var(${DEMO_BAR_HEIGHT_VAR}) + 0.75rem)`;
    };
    apply();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      root.style.removeProperty(DEMO_BAR_HEIGHT_VAR);
      body.style.paddingBottom = prevPadding;
    };
  }, [collapsed]); // the bar element is swapped on toggle, so re-observe

  const isAvailable = (o: Option) =>
    !o.requiresModule || !entitledModules || entitledModules.includes(o.requiresModule);
  const shownRole = currentRole ?? role;
  const roleLabel = options.find((o) => o.role === shownRole)?.label ?? shownRole;

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

  if (collapsed) {
    return (
      <div
        ref={barRef}
        data-testid="demo-role-switcher"
        data-collapsed="true"
        className="fixed right-3 bottom-3 z-[100]"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Show demo role switcher (${roleLabel})`}
          onClick={toggle}
          className="flex h-8 items-center gap-1.5 rounded-full border border-amber-500 bg-background/95 px-2 text-xs shadow-lg backdrop-blur"
        >
          <span className="rounded bg-amber-500 px-1.5 py-0.5 font-bold tracking-wide text-black">
            Demo
          </span>
          <span className="max-w-[8rem] truncate">{roleLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={barRef}
      data-testid="demo-role-switcher"
      data-collapsed="false"
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
          <option key={o.role} value={o.role} disabled={!isAvailable(o)}>
            {isAvailable(o) ? o.label : (o.unavailableLabel ?? o.label)}
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
      <button
        type="button"
        aria-expanded={true}
        aria-label="Collapse demo role switcher"
        className="h-7 rounded border border-border px-2"
        onClick={toggle}
      >
        ×
      </button>
      {error ? <span className="w-full text-destructive">{error}</span> : null}
    </div>
  );
}
