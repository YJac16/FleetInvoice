"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface AreaMultiSelectProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function AreaMultiSelect({
  options,
  value,
  onChange,
  disabled,
}: AreaMultiSelectProps) {
  function toggle(area: string) {
    if (disabled) return;
    if (value.includes(area)) {
      onChange(value.filter((item) => item !== area));
      return;
    }
    onChange([...value, area]);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((area) => {
        const selected = value.includes(area);
        return (
          <button
            key={area}
            type="button"
            disabled={disabled}
            onClick={() => toggle(area)}
            className={cn(
              "flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
              selected
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:bg-muted/40",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <span>{area}</span>
            {selected ? <Check className="size-4 text-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}
