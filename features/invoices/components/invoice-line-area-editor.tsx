"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LocationInput } from "@/features/locations/components/location-input";
import { normalizeAreaValue } from "@/features/locations/lib/location-match";
import { Button } from "@/components/ui/button";
import { listServiceLocations } from "@/services/locations.service";
import { updateInvoiceLineArea } from "@/services/invoices.service";
import { getErrorMessage } from "@/utils/errors";

export function InvoiceLineAreaEditor({
  organisationId,
  lineId,
  initialArea,
  onSaved,
}: {
  organisationId: string;
  lineId: string;
  initialArea: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialArea);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(initialArea);
  }, [initialArea]);

  const locationsQuery = useQuery({
    queryKey: ["service-locations", organisationId],
    queryFn: () => listServiceLocations(organisationId),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const locations = locationsQuery.data ?? [];
      const { value: normalized } = normalizeAreaValue(value, locations);
      await updateInvoiceLineArea(lineId, normalized);
    },
    onSuccess: () => {
      toast.success("Invoice line AREA updated");
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {initialArea || "Set AREA"}
      </Button>
    );
  }

  return (
    <div className="min-w-[240px] space-y-2 rounded-lg border p-3">
      <LocationInput
        organisationId={organisationId}
        value={value}
        onChange={setValue}
        label="Invoice AREA"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(initialArea);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
