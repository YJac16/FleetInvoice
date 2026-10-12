"use client";

import { useEffect, useState } from "react";

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
  valueIso,
  onChangeIso,
  className,
}: {
  id: string;
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => isoDateToDisplay(valueIso));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setText(isoDateToDisplay(valueIso));
    setTouched(false);
  }, [valueIso]);

  const parsed = parseDisplayDateToIso(text);
  const showError = touched && text.length > 0 && !parsed;
  const hint = parsed ? formatIsoDateEnZa(parsed) : null;

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
        value={text}
        onChange={(e) => {
          setTouched(true);
          const next = e.target.value;
          setText(next);
          const iso = parseDisplayDateToIso(next);
          if (iso) onChangeIso(iso);
        }}
        onBlur={() => {
          setTouched(true);
          const iso = parseDisplayDateToIso(text);
          if (iso) {
            setText(isoDateToDisplay(iso));
            onChangeIso(iso);
          }
        }}
        className={cn("w-[10.5rem] font-mono tabular-nums", showError && "border-destructive")}
      />
      <p
        id={`${id}-hint`}
        className={cn(
          "text-[11px] leading-tight",
          showError ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {showError ? "Use DD/MM/YYYY" : hint ? hint : "DD/MM/YYYY"}
      </p>
    </div>
  );
}
