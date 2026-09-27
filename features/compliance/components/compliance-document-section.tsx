"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { prepareComplianceUploadFile } from "@/lib/compliance/client/prepare-upload";
import { queryKeys } from "@/utils/query";

type Props = {
  subjectKind: "driver" | "vehicle";
  subjectId: string;
  docType: string;
  label: string;
  side?: "front" | "back" | "single";
  scanEnabled?: boolean;
};

async function uploadComplianceDocument(input: {
  subjectKind: "driver" | "vehicle";
  subjectId: string;
  docType: string;
  side: string;
  file: File;
}) {
  const form = new FormData();
  form.set("subject_kind", input.subjectKind);
  form.set("subject_id", input.subjectId);
  form.set("doc_type", input.docType);
  form.set("side", input.side);
  form.set("storage_mode", "retained");
  form.set("file", input.file);
  const res = await fetch("/api/compliance/documents", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "upload_failed");
  }
  return res.json();
}

export function ComplianceDocumentSection({
  subjectKind,
  subjectId,
  docType,
  label,
  side = "single",
  scanEnabled = false,
}: Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const docsQuery = useQuery({
    queryKey: queryKeys.complianceDocuments(subjectKind, subjectId, docType, side),
    queryFn: async () => null,
    enabled: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const prepared = await prepareComplianceUploadFile(file);
      return uploadComplianceDocument({
        subjectKind,
        subjectId,
        docType,
        side,
        file: prepared,
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

  async function onPick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    uploadMutation.mutate(file);
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onPick(e.target.files)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => void onPick(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => photoRef.current?.click()}
          >
            <Camera className="mr-1 h-4 w-4" />
            Take photo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="mr-1 h-4 w-4" />
            Upload file
          </Button>
          {scanEnabled ? (
            <Button type="button" size="sm" variant="secondary" disabled>
              Scan to fill
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {docsQuery.isFetching ? null : (
        <p className="text-xs text-muted-foreground">
          View / replace / delete via compliance API (60s signed view).
        </p>
      )}
      <Button type="button" size="sm" variant="ghost" disabled>
        <Trash2 className="mr-1 h-4 w-4" />
        Delete
      </Button>
    </div>
  );
}
