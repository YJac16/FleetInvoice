"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDraftInvoiceLine } from "@/services/invoices.service";
import { getErrorMessage } from "@/utils/errors";

export function InvoiceDraftLineEditor({
  lineId,
  initialDescription,
  initialQuantity,
  initialUnitPrice,
  onSaved,
}: {
  lineId: string;
  initialDescription: string;
  initialQuantity: number;
  initialUnitPrice: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(initialDescription);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [unitPrice, setUnitPrice] = useState(String(initialUnitPrice));

  useEffect(() => {
    setDescription(initialDescription);
    setQuantity(String(initialQuantity));
    setUnitPrice(String(initialUnitPrice));
  }, [initialDescription, initialQuantity, initialUnitPrice]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedQuantity = Number(quantity);
      const parsedUnitPrice = Number(unitPrice);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        throw new Error("Quantity must be greater than zero");
      }
      if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
        throw new Error("Unit price cannot be negative");
      }
      await updateDraftInvoiceLine(
        lineId,
        description,
        parsedQuantity,
        parsedUnitPrice
      );
    },
    onSuccess: () => {
      toast.success("Draft line updated");
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  const previewAmount = (() => {
    const q = Number(quantity);
    const p = Number(unitPrice);
    if (!Number.isFinite(q) || !Number.isFinite(p)) return "—";
    return (Math.round(q * p * 100) / 100).toFixed(2);
  })();

  return (
    <div className="min-w-[280px] space-y-3 rounded-lg border bg-card p-3 text-left">
      <div className="space-y-1.5">
        <Label htmlFor={`line-desc-${lineId}`}>Description</Label>
        <Textarea
          id={`line-desc-${lineId}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`line-qty-${lineId}`}>Quantity</Label>
          <Input
            id={`line-qty-${lineId}`}
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`line-price-${lineId}`}>Unit price</Label>
          <Input
            id={`line-price-${lineId}`}
            type="number"
            min="0"
            step="any"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Amount preview: <span className="font-medium text-foreground">R {previewAmount}</span>
      </p>
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
            setDescription(initialDescription);
            setQuantity(String(initialQuantity));
            setUnitPrice(String(initialUnitPrice));
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
