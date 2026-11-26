"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type CompactSelectOption<T extends string> = { value: T; label: string };

/**
 * Labelled native `<select>` used below `lg` in place of chip / pill rows.
 * Native keeps Tab, Enter/Space, Escape and arrow keys working on every device.
 * The visible label is the control's accessible name (`label`).
 */
export function CompactSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel = false,
  placeholder,
}: {
  label: string;
  value: T | "";
  options: CompactSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  hideLabel?: boolean;
  /** Shown as a disabled first option when `value` is "" (e.g. Jump to). */
  placeholder?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs text-muted-foreground", className)}>
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-1 pr-9 pl-3 text-sm font-medium text-foreground shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </span>
    </label>
  );
}
