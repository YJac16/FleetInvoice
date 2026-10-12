"use client";

import { useEffect, useRef, useState } from "react";

import { SastDateInput } from "@/components/shared/sast-date-input";
import { Button } from "@/components/ui/button";
import {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  formatRangeLabel,
  type ResolvedDateRange,
} from "@/lib/date-range/sast-range";
import { cn } from "@/lib/utils";

function FilterChipRow({
  activePreset,
  customPanelOpen,
  onPresetClick,
}: {
  activePreset: DateRangePreset;
  customPanelOpen: boolean;
  onPresetClick: (preset: DateRangePreset) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  const updateFades = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setFadeLeft(scrollLeft > 4);
    setFadeRight(scrollLeft + clientWidth < scrollWidth - 4);
  };

  useEffect(() => {
    updateFades();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFades, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(updateFades);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", updateFades);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="relative min-w-0 flex-1">
      {fadeLeft ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background via-background/80 to-transparent"
          aria-hidden
        />
      ) : null}
      {fadeRight ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background via-background/80 to-transparent"
          aria-hidden
        />
      ) : null}
      <div
        ref={scrollerRef}
        className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 pr-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible"
        role="group"
        aria-label="Filter by date range"
      >
        {DATE_RANGE_PRESETS.map((option) => {
          const selected =
            option.value === "custom"
              ? customPanelOpen || activePreset === "custom"
              : activePreset === option.value && !customPanelOpen;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              className={cn(
                "shrink-0 rounded-full whitespace-nowrap",
                selected && "shadow-sm"
              )}
              aria-pressed={selected}
              onClick={() => onPresetClick(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangeFilter({
  range,
  onPresetChange,
  onCustomChange,
  className,
  updating = false,
}: {
  range: ResolvedDateRange;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (from: string, to: string) => void;
  className?: string;
  /** Range/query key changed and fresh data is still loading. */
  updating?: boolean;
}) {
  const [customPanelOpen, setCustomPanelOpen] = useState(
    range.preset === "custom"
  );
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  useEffect(() => {
    if (range.preset === "custom") {
      setCustomPanelOpen(true);
      setDraftFrom(range.from);
      setDraftTo(range.to);
    }
  }, [range.from, range.preset, range.to]);

  const handlePresetClick = (preset: DateRangePreset) => {
    if (preset === "custom") {
      setDraftFrom(range.from);
      setDraftTo(range.to);
      setCustomPanelOpen(true);
      return;
    }
    setCustomPanelOpen(false);
    onPresetChange(preset);
  };

  const showCustomPanel = customPanelOpen;
  const rangeStatusLabel = customPanelOpen
    ? "Custom (not applied)"
    : formatRangeLabel(range);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FilterChipRow
          activePreset={customPanelOpen ? "custom" : range.preset}
          customPanelOpen={customPanelOpen}
          onPresetClick={handlePresetClick}
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:shrink-0">
          <span>{rangeStatusLabel} · SAST</span>
          {updating ? (
            <span
              className="inline-flex items-center gap-1 font-medium text-foreground motion-safe:animate-pulse motion-reduce:animate-none"
              role="status"
            >
              <span
                className="size-2.5 shrink-0 rounded-full border-2 border-accent border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              Updating…
            </span>
          ) : null}
        </p>
      </div>
      {showCustomPanel ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
          <SastDateInput
            id="date-range-from"
            label="From"
            valueIso={draftFrom}
            onChangeIso={setDraftFrom}
          />
          <SastDateInput
            id="date-range-to"
            label="To"
            valueIso={draftTo}
            onChangeIso={setDraftTo}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onCustomChange(draftFrom, draftTo);
              setCustomPanelOpen(true);
            }}
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
