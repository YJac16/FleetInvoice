"use client";

import type { DateRangePreset, ResolvedDateRange } from "@/lib/date-range/sast-range";
import { Button } from "@/components/ui/button";

export function DateRangeEmptyActions({
  range,
  onPresetChange,
  hasExtraFilter,
  onClearExtraFilter,
  extraFilterClearLabel = "Clear filter",
}: {
  range: ResolvedDateRange;
  onPresetChange: (preset: DateRangePreset) => void;
  hasExtraFilter?: boolean;
  onClearExtraFilter?: () => void;
  extraFilterClearLabel?: string;
}) {
  const showLastWeek = range.preset !== "last_week";
  const showClearRange = range.preset !== "this_week";

  if (!showLastWeek && !hasExtraFilter && !showClearRange) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {showLastWeek ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 rounded-full md:min-h-8"
          onClick={() => onPresetChange("last_week")}
        >
          Try Last week
        </Button>
      ) : null}
      {showClearRange ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 md:min-h-8"
          onClick={() => onPresetChange("this_week")}
        >
          Clear filter
        </Button>
      ) : null}
      {hasExtraFilter && onClearExtraFilter ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 md:min-h-8"
          onClick={onClearExtraFilter}
        >
          {extraFilterClearLabel}
        </Button>
      ) : null}
    </div>
  );
}
