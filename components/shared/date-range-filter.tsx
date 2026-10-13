"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SastDateInput } from "@/components/shared/sast-date-input";
import { Button } from "@/components/ui/button";
import { isoDateToDisplay } from "@/lib/date-range/calendar-text";
import { customRangeApplyDisabledTitle } from "@/lib/date-range/custom-range-apply";
import { validateCustomRangeDraft } from "@/lib/date-range/custom-range-draft";
import { formatRangeResultCount } from "@/lib/date-range/result-count-label";
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
  chipScrollKey,
  onPresetClick,
}: {
  activePreset: DateRangePreset;
  customPanelOpen: boolean;
  chipScrollKey: string;
  onPresetClick: (preset: DateRangePreset) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const narrow = window.matchMedia("(max-width: 390px)");
    if (!narrow.matches) return;
    activeChipRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activePreset, customPanelOpen, chipScrollKey]);

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
        className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain scroll-pr-1.5 pb-1 pr-1.5 [scroll-padding-inline-end:6px] [scrollbar-width:thin] md:flex-wrap md:overflow-visible"
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
              ref={selected ? activeChipRef : undefined}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-3.5 whitespace-nowrap md:min-h-7 md:h-7 md:px-2.5",
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

function draftsFromRange(range: ResolvedDateRange) {
  return {
    fromText: isoDateToDisplay(range.from),
    toText: isoDateToDisplay(range.to),
  };
}

function CustomRangeFields({
  draftFromText,
  draftToText,
  showFromInvalid,
  showToInvalid,
  toFieldError,
  applyDisabledTitle,
  canApply,
  onFromChange,
  onToChange,
  onApply,
  onKeyDown,
}: {
  draftFromText: string;
  draftToText: string;
  showFromInvalid: boolean;
  showToInvalid: boolean;
  toFieldError: string | null;
  applyDisabledTitle?: string;
  canApply: boolean;
  onFromChange: (text: string) => void;
  onToChange: (text: string) => void;
  onApply: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Custom date range"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-end gap-3"
    >
      <SastDateInput
        id="date-range-from"
        label="From"
        text={draftFromText}
        invalid={showFromInvalid}
        onTextChange={onFromChange}
      />
      <SastDateInput
        id="date-range-to"
        label="To"
        text={draftToText}
        invalid={showToInvalid}
        fieldError={toFieldError}
        onTextChange={onToChange}
      />
      <Button
        type="button"
        size="sm"
        className="min-h-11 md:min-h-8"
        disabled={!canApply}
        aria-disabled={!canApply}
        title={applyDisabledTitle}
        onClick={onApply}
      >
        Apply
      </Button>
    </div>
  );
}

export function DateRangeFilter({
  range,
  onPresetChange,
  onCustomChange,
  className,
  updating = false,
  resultCount,
  resultUnit,
}: {
  range: ResolvedDateRange;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (from: string, to: string) => void;
  className?: string;
  updating?: boolean;
  resultCount?: number;
  resultUnit?: { singular: string; plural: string };
}) {
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [draftFromText, setDraftFromText] = useState(() =>
    isoDateToDisplay(range.from)
  );
  const [draftToText, setDraftToText] = useState(() =>
    isoDateToDisplay(range.to)
  );
  const [fieldsTouched, setFieldsTouched] = useState(false);

  const resetDraftsToApplied = useCallback(() => {
    const { fromText, toText } = draftsFromRange(range);
    setDraftFromText(fromText);
    setDraftToText(toText);
    setFieldsTouched(false);
  }, [range]);

  const closeCustomPanel = useCallback(() => {
    resetDraftsToApplied();
    setCustomPanelOpen(false);
  }, [resetDraftsToApplied]);

  useEffect(() => {
    resetDraftsToApplied();
  }, [range.from, range.preset, range.to, resetDraftsToApplied]);

  const validation = validateCustomRangeDraft(draftFromText, draftToText);
  const appliedFromText = isoDateToDisplay(range.from);
  const appliedToText = isoDateToDisplay(range.to);
  const draftsDifferFromApplied =
    draftFromText !== appliedFromText || draftToText !== appliedToText;
  const showFromInvalid = fieldsTouched && validation.fromInvalid;
  const showToInvalid =
    fieldsTouched && (validation.toInvalid || Boolean(validation.orderError));

  const handleApply = useCallback(() => {
    if (!validation.canApply || !validation.fromIso || !validation.toIso) return;
    onCustomChange(validation.fromIso, validation.toIso);
    setCustomPanelOpen(false);
    setFieldsTouched(false);
  }, [onCustomChange, validation]);

  const handlePresetClick = (preset: DateRangePreset) => {
    if (preset === "custom") {
      resetDraftsToApplied();
      setCustomPanelOpen(true);
      return;
    }
    closeCustomPanel();
    onPresetChange(preset);
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeCustomPanel();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (validation.canApply) handleApply();
    }
  };

  const customNotApplied = customPanelOpen && draftsDifferFromApplied;
  const rangeStatusLabel = customNotApplied
    ? "Custom (not applied)"
    : formatRangeLabel(range);

  const toFieldError =
    fieldsTouched && validation.orderError ? validation.orderError : null;

  const applyDisabledTitle = customRangeApplyDisabledTitle(
    validation,
    draftFromText,
    draftToText
  );

  const chipScrollKey = `${range.preset}:${range.from}:${range.to}`;

  const countLabel =
    resultCount !== undefined && resultUnit
      ? formatRangeResultCount(resultCount, resultUnit.singular, resultUnit.plural)
      : null;

  const customFields = (
    <CustomRangeFields
      draftFromText={draftFromText}
      draftToText={draftToText}
      showFromInvalid={showFromInvalid}
      showToInvalid={showToInvalid}
      toFieldError={toFieldError}
      applyDisabledTitle={applyDisabledTitle}
      canApply={validation.canApply}
      onFromChange={(text) => {
        setFieldsTouched(true);
        setDraftFromText(text);
      }}
      onToChange={(text) => {
        setFieldsTouched(true);
        setDraftToText(text);
      }}
      onApply={handleApply}
      onKeyDown={handlePanelKeyDown}
    />
  );

  return (
    <div
      className={cn(
        "sticky top-0 z-30 -mx-1 space-y-3 bg-background/95 py-2 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85",
        className
      )}
    >
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <FilterChipRow
          activePreset={customPanelOpen ? "custom" : range.preset}
          customPanelOpen={customPanelOpen}
          chipScrollKey={chipScrollKey}
          onPresetClick={handlePresetClick}
        />
        <p className="px-1 text-xs text-muted-foreground sm:shrink-0">
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {rangeStatusLabel} · SAST
              {countLabel ? (
                <span className="text-foreground"> · {countLabel}</span>
              ) : null}
            </span>
            <span
              className="inline-flex h-6 w-[8.25rem] shrink-0 items-center sm:w-[8.75rem]"
              aria-hidden={!updating}
            >
              <span
                className={cn(
                  "inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-muted/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm",
                  "motion-safe:animate-pulse motion-reduce:animate-none",
                  !updating && "invisible"
                )}
                role="status"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full border-2 border-accent border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
                Updating…
              </span>
            </span>
          </span>
        </p>
      </div>
      {customPanelOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="Close custom date range"
            onClick={closeCustomPanel}
          />
          <div
            className={cn(
              "relative z-50 mx-1 rounded-lg border bg-muted/20 p-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[min(85vh,32rem)] max-md:overflow-y-auto max-md:rounded-t-xl max-md:border-t max-md:bg-background max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:shadow-xl"
            )}
          >
            <p className="mb-3 text-sm font-medium md:hidden">Custom range</p>
            {customFields}
          </div>
        </>
      ) : null}
    </div>
  );
}
