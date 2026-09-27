"use client";

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { NormalisedEvidence } from "@/lib/compliance/evidence";
import type { ScanFieldMapping } from "@/features/compliance/lib/scan-field-map";
import { canApplyScanReview } from "@/lib/compliance/scan-review-gate";

export type ScanSuggestion = {
  value: string;
  confidence: number;
  evidence: NormalisedEvidence;
};

type FieldUiState = {
  mapping: ScanFieldMapping;
  suggestion: ScanSuggestion | null;
  editedValue: string;
  confirmed: boolean;
  showSuggestion: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewUrl: string | null;
  fieldMappings: ScanFieldMapping[];
  suggestions: Record<string, ScanSuggestion>;
  warnings: string[];
  onApply: (values: Record<string, string>) => void;
};

function bboxStyle(evidence: NormalisedEvidence): CSSProperties | null {
  if (!evidence || !("bbox" in evidence)) return null;
  const [x, y, w, h] = evidence.bbox;
  return {
    position: "absolute",
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
    border: "2px solid rgb(245 158 11)",
    background: "rgba(245, 158, 11, 0.15)",
    pointerEvents: "none",
  };
}

export function ComplianceScanReviewDialog({
  open,
  onOpenChange,
  previewUrl,
  fieldMappings,
  suggestions,
  warnings,
  onApply,
}: Props) {
  const initialFields = useMemo(() => {
    return fieldMappings.map((mapping) => {
      const suggestion = suggestions[mapping.scanKey] ?? null;
      const lowConfidence = (suggestion?.confidence ?? 0) < 0.85;
      const invalid = warnings.some((w) => w.includes(mapping.scanKey));
      const showSuggestion = Boolean(suggestion?.value) && !invalid;
      return {
        mapping,
        suggestion,
        editedValue: showSuggestion ? suggestion!.value : "",
        confirmed: false,
        showSuggestion,
      } satisfies FieldUiState;
    });
  }, [fieldMappings, suggestions, warnings]);

  const [fields, setFields] = useState<FieldUiState[]>(initialFields);
  const [checkedDoc, setCheckedDoc] = useState(false);

  useEffect(() => {
    if (open) {
      setFields(initialFields);
      setCheckedDoc(false);
    }
  }, [open, initialFields]);

  const highlightEvidence = fields.find((f) => f.suggestion?.evidence)?.suggestion?.evidence ?? null;

  const canSave = canApplyScanReview(fields, checkedDoc);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review scan suggestions</DialogTitle>
        </DialogHeader>

        {previewUrl ? (
          <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Document preview" className="block w-full" />
            {highlightEvidence ? (
              <div style={bboxStyle(highlightEvidence) ?? undefined} aria-hidden />
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {fields.map((field, idx) => {
            const warn =
              field.suggestion &&
              (field.suggestion.confidence < 0.85 ||
                warnings.some((w) => w.includes(field.mapping.scanKey)));
            return (
              <div key={field.mapping.scanKey} className="space-y-1 rounded border p-2">
                <p className="text-sm font-medium">{field.mapping.label}</p>
                {field.showSuggestion ? (
                  <p
                    className={`text-xs ${warn ? "text-amber-600" : "text-muted-foreground"}`}
                  >
                    Suggested from scan
                    {field.suggestion
                      ? ` (${Math.round(field.suggestion.confidence * 100)}% confidence)`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-destructive">Could not suggest — enter manually</p>
                )}
                <Input
                  value={field.editedValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFields((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, editedValue: value, confirmed: false } : row
                      )
                    );
                  }}
                />
                {field.showSuggestion ? (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={field.confirmed}
                      onCheckedChange={(v) =>
                        setFields((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, confirmed: v === true } : row
                          )
                        )
                      }
                    />
                    Confirm this field
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={checkedDoc} onCheckedChange={(v) => setCheckedDoc(v === true)} />
          I have checked these details against the document
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              const values: Record<string, string> = {};
              for (const field of fields) {
                if (field.editedValue.trim()) {
                  values[field.mapping.formKey] = field.editedValue.trim();
                }
              }
              onApply(values);
              onOpenChange(false);
            }}
          >
            Apply to form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
