"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import {
  csvToObjects,
  downloadCsv,
  objectsToCsv,
} from "@/features/import/lib/csv";
import { getErrorMessage } from "@/utils/errors";

export type CsvImportColumn = {
  key: string;
  label: string;
  required?: boolean;
};

type CsvImportDialogProps<TSchema extends z.ZodType> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: CsvImportColumn[];
  schema: TSchema;
  templateFilename: string;
  onImport: (rows: z.infer<TSchema>[]) => Promise<void>;
};

type PreviewRow = {
  index: number;
  raw: Record<string, string>;
  parsed?: z.infer<z.ZodType>;
  error?: string;
};

export function CsvImportDialog<TSchema extends z.ZodType>({
  open,
  onOpenChange,
  title,
  columns,
  schema,
  templateFilename,
  onImport,
}: CsvImportDialogProps<TSchema>) {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const validRows = useMemo(
    () => preview.filter((row) => row.parsed && !row.error),
    [preview]
  );
  const invalidCount = preview.length - validRows.length;

  function handleTemplateDownload() {
    const headers = columns.map((c) => c.key);
    downloadCsv(templateFilename, objectsToCsv(headers, []));
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const objects = csvToObjects(text);
    const next: PreviewRow[] = objects.map((raw, index) => {
      const result = schema.safeParse(raw);
      if (!result.success) {
        const message = result.error.issues
          .map((issue) => issue.message)
          .join("; ");
        return { index: index + 2, raw, error: message };
      }
      return { index: index + 2, raw, parsed: result.data };
    });
    setPreview(next);
  }

  async function handleImport() {
    if (!validRows.length) {
      toast.error("No valid rows to import");
      return;
    }
    setSubmitting(true);
    try {
      await onImport(validRows.map((row) => row.parsed as z.infer<TSchema>));
      toast.success(`Imported ${validRows.length} row(s)`);
      setPreview([]);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Import failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPreview([]);
        onOpenChange(next);
      }}
      title={title}
      description="Download a template, fill rows, then upload a CSV file."
      footer={
        <>
          <Button variant="outline" onClick={handleTemplateDownload}>
            Download template
          </Button>
          <Button
            disabled={!validRows.length || submitting}
            onClick={() => void handleImport()}
          >
            {submitting
              ? "Importing…"
              : `Import ${validRows.length || ""}`.trim()}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {preview.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {validRows.length} valid · {invalidCount} with errors
            </p>
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1.5">Line</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((row) => (
                    <tr key={row.index} className="border-t">
                      <td className="px-2 py-1.5">{row.index}</td>
                      <td className="px-2 py-1.5">
                        {row.error ? "Error" : "OK"}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.error ??
                          columns
                            .map((c) => row.raw[c.key] || "—")
                            .slice(0, 3)
                            .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}
