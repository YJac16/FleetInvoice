"use client";

import { ExternalLink, FileText, Paperclip, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { attachmentErrorMessage } from "@/features/maintenance/lib/rpc-errors";

/** Mirrors lib/maintenance/attachment.ts; the route re-checks the real bytes. */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const ALLOWED = new Set(ACCEPT.split(","));

const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  billId: string;
  hasAttachment: boolean;
  mime: string | null;
  size: number | null;
  /** Draft bill and the user may manage maintenance. */
  canUpload: boolean;
};

export function BillAttachmentPanel({ billId, hasAttachment, mime, size, canUpload }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const endpoint = `/api/maintenance/bills/${billId}/attachment`;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(attachmentErrorMessage("file_too_large"));
      return;
    }
    if (file.type && !ALLOWED.has(file.type)) {
      toast.error(attachmentErrorMessage("unsupported_media_type"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(attachmentErrorMessage(body.error));
        return;
      }
      toast.success(hasAttachment ? "Attachment replaced" : "Attachment uploaded");
      router.refresh();
    } catch {
      toast.error(attachmentErrorMessage(undefined));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleView() {
    // Open the tab synchronously so mobile browsers don't block it, then
    // point it at the short-lived signed URL.
    const tab = window.open("", "_blank");
    setOpening(true);
    try {
      const res = await fetch(endpoint, { method: "GET", cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        tab?.close();
        toast.error(attachmentErrorMessage(body.error));
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = body.url;
      } else {
        window.location.assign(body.url);
      }
    } catch {
      tab?.close();
      toast.error(attachmentErrorMessage(undefined));
    } finally {
      setOpening(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" aria-labelledby="bill-attachment-heading">
      <h2 id="bill-attachment-heading" className="flex items-center gap-2 text-base font-medium">
        <Paperclip className="size-4" /> Supplier bill
      </h2>

      {hasAttachment ? (
        <div className="flex items-center gap-3 text-sm">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">
            {MIME_LABEL[mime ?? ""] ?? "File"}
            {size ? ` · ${formatSize(size)}` : ""}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No file attached.</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {hasAttachment ? (
          <Button size="lg" variant="outline" onClick={handleView} disabled={opening} className="w-full sm:w-auto">
            <ExternalLink className="size-4" /> {opening ? "Opening…" : "View attachment"}
          </Button>
        ) : null}
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose bill file"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Button
              size="lg"
              variant={hasAttachment ? "ghost" : "default"}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto"
            >
              <Upload className="size-4" />
              {uploading ? "Uploading…" : hasAttachment ? "Replace file" : "Upload file"}
            </Button>
          </>
        ) : null}
      </div>
      {canUpload ? (
        <p className="text-xs text-muted-foreground">PDF, JPEG, PNG or WebP, up to 10 MB.</p>
      ) : null}
    </section>
  );
}
