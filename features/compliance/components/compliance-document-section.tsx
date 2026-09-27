"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Eye, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import {
  ComplianceScanReviewDialog,
  type ScanSuggestion,
} from "@/features/compliance/components/compliance-scan-review-dialog";
import {
  docTypeToScanSubject,
  SCAN_FIELD_MAP,
} from "@/features/compliance/lib/scan-field-map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { prepareComplianceUploadFile } from "@/lib/compliance/client/prepare-upload";
import {
  deleteComplianceDocument,
  fetchCurrentComplianceDocument,
} from "@/services/compliance-documents.client";
import { queryKeys } from "@/utils/query";

type Props = {
  subjectKind: "driver" | "vehicle";
  subjectId: string;
  docType: string;
  label: string;
  side?: "front" | "back" | "single";
  scanEnabled?: boolean;
  onApplyScanFields: (values: Record<string, string>) => void;
};

async function uploadComplianceDocument(input: {
  subjectKind: "driver" | "vehicle";
  subjectId: string;
  docType: string;
  side: string;
  file: File;
  storageMode: "retained" | "scan_discard";
}) {
  const form = new FormData();
  form.set("subject_kind", input.subjectKind);
  form.set("subject_id", input.subjectId);
  form.set("doc_type", input.docType);
  form.set("side", input.side);
  form.set("storage_mode", input.storageMode);
  form.set("file", input.file);
  const res = await fetch("/api/compliance/documents", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    document_id?: string;
    temp_scan_id?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "upload_failed");
  return body;
}

async function runScan(input: {
  subjectKind: ReturnType<typeof docTypeToScanSubject>;
  subjectId: string;
  documentId?: string;
  tempScanId?: string;
  storageMode: "retained" | "scan_discard";
  docType: string;
}) {
  const res = await fetch("/api/compliance/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject_kind: input.subjectKind,
      subject_id: input.subjectId,
      document_id: input.documentId,
      temp_scan_id: input.tempScanId,
      storage_mode: input.storageMode,
      doc_type: input.docType,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    suggestions?: Record<string, { value: string; confidence: number; evidence: unknown }>;
    warnings?: string[];
  };
  if (!res.ok) throw new Error(body.message ?? body.error ?? "scan_failed");
  return body;
}

export function ComplianceDocumentSection({
  subjectKind,
  subjectId,
  docType,
  label,
  side = "single",
  scanEnabled = false,
  onApplyScanFields,
}: Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepCopy, setKeepCopy] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, ScanSuggestion>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const qc = useQueryClient();

  const scanSubject = docTypeToScanSubject(subjectKind, docType);
  const fieldMappings = SCAN_FIELD_MAP[scanSubject];

  const docQuery = useQuery({
    queryKey: queryKeys.complianceDocuments(subjectKind, subjectId, docType, side),
    queryFn: () =>
      fetchCurrentComplianceDocument({ subjectKind, subjectId, docType, side }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: { file: File; storageMode: "retained" | "scan_discard" }) => {
      const prepared = await prepareComplianceUploadFile(input.file);
      return uploadComplianceDocument({
        subjectKind,
        subjectId,
        docType,
        side,
        file: prepared,
        storageMode: input.storageMode,
      });
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({
        queryKey: queryKeys.complianceDocuments(subjectKind, subjectId, docType, side),
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  async function onPick(fileList: FileList | null, mode: "retained" | "scan_discard") {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    uploadMutation.mutate({ file, storageMode: mode });
  }

  async function handleScanToFill() {
    setError(null);
    try {
      const current = docQuery.data;
      if (current?.id) {
        const result = await runScan({
          subjectKind: scanSubject,
          subjectId,
          documentId: current.id,
          storageMode: "retained",
          docType,
        });
        setSuggestions((result.suggestions ?? {}) as Record<string, ScanSuggestion>);
        setWarnings(result.warnings ?? []);
        setPreviewUrl(`/api/compliance/documents/${current.id}/view`);
        setReviewOpen(true);
        return;
      }

      setError("Upload a document first, or use Scan-and-discard from Upload file.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "scan_failed");
    }
  }

  async function handleScanDiscardUpload(file: File) {
    const prepared = await prepareComplianceUploadFile(file);
    const preview = URL.createObjectURL(prepared);
    const upload = await uploadComplianceDocument({
      subjectKind,
      subjectId,
      docType,
      side,
      file: prepared,
      storageMode: "scan_discard",
    });
    if (!upload.temp_scan_id) throw new Error("temp_scan_missing");
    try {
      const result = await runScan({
        subjectKind: scanSubject,
        subjectId,
        tempScanId: upload.temp_scan_id,
        storageMode: "scan_discard",
        docType,
      });
      setSuggestions((result.suggestions ?? {}) as Record<string, ScanSuggestion>);
      setWarnings(result.warnings ?? []);
      setPreviewUrl(preview);
      setReviewOpen(true);
    } catch (err) {
      URL.revokeObjectURL(preview);
      throw err;
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {docQuery.data ? (
            <p className="text-xs text-muted-foreground">
              On file · {docQuery.data.file_name ?? "document"} (
              {new Date(docQuery.data.created_at).toLocaleDateString()})
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No document on file</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid={`${docType}-photo-input`}
            onChange={(e) => {
              const mode = scanEnabled && !keepCopy ? "scan_discard" : "retained";
              if (mode === "scan_discard" && e.target.files?.[0]) {
                void handleScanDiscardUpload(e.target.files[0]).catch((err) =>
                  setError(err instanceof Error ? err.message : "scan_failed")
                );
              } else {
                void onPick(e.target.files, "retained");
              }
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            data-testid={`${docType}-file-input`}
            onChange={(e) => {
              const mode = scanEnabled && !keepCopy ? "scan_discard" : "retained";
              if (mode === "scan_discard" && e.target.files?.[0]) {
                void handleScanDiscardUpload(e.target.files[0]).catch((err) =>
                  setError(err instanceof Error ? err.message : "scan_failed")
                );
              } else {
                void onPick(e.target.files, "retained");
              }
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => photoRef.current?.click()}>
            <Camera className="mr-1 h-4 w-4" />
            Take photo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-1 h-4 w-4" />
            Upload file
          </Button>
          {scanEnabled ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void handleScanToFill()}>
              Scan to fill
            </Button>
          ) : null}
        </div>
      </div>

      {scanEnabled ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={keepCopy} onCheckedChange={(v) => setKeepCopy(v === true)} />
          Keep a copy of this document (required for a permanent stored file)
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!docQuery.data}
          onClick={() => {
            if (docQuery.data) window.open(`/api/compliance/documents/${docQuery.data.id}/view`, "_blank");
          }}
        >
          <Eye className="mr-1 h-4 w-4" />
          View
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => fileRef.current?.click()}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Replace
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!docQuery.data || uploadMutation.isPending}
          onClick={() => {
            if (!docQuery.data) return;
            void deleteComplianceDocument(docQuery.data.id)
              .then(() => docQuery.refetch())
              .catch((err) => setError(err.message));
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ComplianceScanReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        previewUrl={previewUrl}
        fieldMappings={fieldMappings}
        suggestions={suggestions}
        warnings={warnings}
        onApply={onApplyScanFields}
      />
    </div>
  );
}
