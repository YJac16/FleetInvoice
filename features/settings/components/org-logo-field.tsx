"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  removeOrganisationLogo,
  uploadOrganisationLogo,
} from "@/services/organisations.service";
import { getErrorMessage } from "@/utils/errors";

export function OrgLogoField({
  organisationId,
  logoUrl,
  organisationName,
  onUpdated,
}: {
  organisationId: string;
  logoUrl: string | null;
  organisationName: string;
  onUpdated: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadOrganisationLogo(organisationId, file),
    onSuccess: async () => {
      await onUpdated();
      toast.success("Company logo updated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeOrganisationLogo(organisationId),
    onSuccess: async () => {
      await onUpdated();
      toast.success("Company logo removed");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const busy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <Label>Invoice logo</Label>
        <p className="text-sm text-muted-foreground">
          Shown on printed invoices. Without a logo, invoices use a text-only
          header with your organisation name.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 min-w-[120px] items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${organisationName} logo`}
              className="max-h-12 max-w-[180px] object-contain"
            />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              Text-only header
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {logoUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => removeMutation.mutate()}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
