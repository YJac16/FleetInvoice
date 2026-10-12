"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatIsoDateEnZa,
  isoDateToDisplay,
  parseDisplayDateToIso,
} from "@/lib/date-range/calendar-text";
import { cn } from "@/lib/utils";

export function SastDateInput({
  id,
  label,
  text,
  onTextChange,
  invalid = false,
  fieldError = null,
  className,
}: {
  id: string;
  label: string;
  text: string;
  onTextChange: (text: string) => void;
  /** Parent-validated: non-empty text that does not parse. */
  invalid?: boolean;
  /** Validation message shown under the field (e.g. date order). */
  fieldError?: string | null;
  className?: string;
}) {
  const parsed = parseDisplayDateToIso(text);
  const showError = invalid;
  const hint = parsed ? formatIsoDateEnZa(parsed) : null;
  const hintText =
    fieldError ?? (showError ? "Use DD/MM/YYYY" : hint ? hint : "DD/MM/YYYY");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        aria-describedby={`${id}-hint`}
        aria-invalid={showError ? true : undefined}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={() => {
          const iso = parseDisplayDateToIso(text);
          if (iso) onTextChange(isoDateToDisplay(iso));
        }}
        className={cn(
          "w-[10.5rem] font-mono tabular-nums",
          showError && "border-destructive"
        )}
      />
      <p
        id={`${id}-hint`}
        className={cn(
          "min-h-[1.125rem] text-[11px] leading-tight",
          fieldError || showError ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {hintText}
      </p>
    </div>
  );
}
