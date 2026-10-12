"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  formatRangeLabel,
  type ResolvedDateRange,
} from "@/lib/date-range/sast-range";
import { cn } from "@/lib/utils";

function FilterChipRow({
  value,
  onChange,
}: {
  value: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
}) {
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter by date range"
    >
      {DATE_RANGE_PRESETS.map((option) => {
        const selected = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            className={cn("shrink-0 rounded-full", selected && "shadow-sm")}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function DateRangeFilter({
  range,
  onPresetChange,
  onCustomChange,
  className,
}: {
  range: ResolvedDateRange;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (from: string, to: string) => void;
  className?: string;
}) {
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  useEffect(() => {
    if (range.preset === "custom") {
      setDraftFrom(range.from);
      setDraftTo(range.to);
    }
  }, [range.from, range.preset, range.to]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChipRow value={range.preset} onChange={onPresetChange} />
        <p className="text-xs text-muted-foreground md:shrink-0">
          {formatRangeLabel(range)} · SAST
        </p>
      </div>
      {range.preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="date-range-from" className="text-xs">
              From
            </Label>
            <Input
              id="date-range-from"
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-[10.5rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date-range-to" className="text-xs">
              To
            </Label>
            <Input
              id="date-range-to"
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="w-[10.5rem]"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onCustomChange(draftFrom, draftTo)}
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
