"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_DOC_TYPES,
  type VehicleDocType,
} from "@/lib/constants";
import {
  createVehicleDocument,
  getVehicleDocumentSignedUrl,
  listVehicleDocuments,
  softDeleteVehicleDocument,
  uploadVehicleDocumentFile,
} from "@/services/vehicle-documents.service";
import type { Vehicle } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

type VehicleDocumentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  vehicle: Vehicle | null;
  canManage: boolean;
};

export function VehicleDocumentsDialog({
  open,
  onOpenChange,
  organisationId,
  vehicle,
  canManage,
}: VehicleDocumentsDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<VehicleDocType>("other");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const docsQuery = useQuery({
    queryKey:
      vehicle && organisationId
        ? queryKeys.vehicleDocuments(organisationId, vehicle.id)
        : ["vehicle-documents", "none"],
    queryFn: () => listVehicleDocuments(organisationId, vehicle!.id),
    enabled: open && Boolean(vehicle),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle || !name.trim()) throw new Error("Name is required");
      let storagePath: string | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;

      if (file) {
        try {
          const uploaded = await uploadVehicleDocumentFile({
            organisationId,
            vehicleId: vehicle.id,
            file,
          });
          storagePath = uploaded.storagePath;
          fileName = uploaded.fileName;
          mimeType = uploaded.mimeType;
        } catch (error) {
          // Allow metadata-only if Storage bucket is missing
          toast.message(
            getErrorMessage(
              error,
              "File upload failed — saving metadata only"
            )
          );
        }
      }

      return createVehicleDocument({
        organisationId,
        vehicleId: vehicle.id,
        name: name.trim(),
        docType,
        storagePath,
        fileName,
        mimeType,
        expiresAt: expiresAt || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.vehicleDocuments(organisationId, vehicle!.id),
      });
      setName("");
      setDocType("other");
      setExpiresAt("");
      setNotes("");
      setFile(null);
      toast.success("Document added");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteVehicleDocument(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.vehicleDocuments(organisationId, vehicle!.id),
      });
      toast.success("Document archived");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={vehicle ? `Documents · ${vehicle.name}` : "Documents"}
      description="Track license disks, insurance, and other vehicle compliance files."
    >
      {!vehicle ? null : docsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-6">
          {(docsQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No documents"
              description="Add metadata or upload a file to the vehicle-docs bucket."
            />
          ) : (
            <ul className="space-y-2">
              {(docsQuery.data ?? []).map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {VEHICLE_DOC_TYPE_LABELS[doc.doc_type]} · Expires{" "}
                      {formatDate(doc.expires_at)}
                    </p>
                    {doc.storage_path ? (
                      <button
                        type="button"
                        className="mt-1 text-xs text-accent underline-offset-2 hover:underline"
                        onClick={() => {
                          void getVehicleDocumentSignedUrl(doc.storage_path!).then(
                            (url) => {
                              if (url) window.open(url, "_blank");
                              else toast.error("Could not open file");
                            }
                          );
                        }}
                      >
                        Open file
                      </button>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Metadata only
                      </p>
                    )}
                  </div>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(doc.id)}
                    >
                      Archive
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="2026 insurance certificate"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={docType}
                  onValueChange={(value) =>
                    setDocType((value as VehicleDocType) ?? "other")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_DOC_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {VEHICLE_DOC_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expires</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>File (optional)</Label>
                <Input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button
                className="w-full"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Saving…" : "Add document"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}
