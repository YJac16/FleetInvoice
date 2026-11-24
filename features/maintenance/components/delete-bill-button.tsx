"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteWorkshopBillAction } from "@/features/maintenance/actions";

/** Draft bills only; the page decides whether to render it. */
export function DeleteBillButton({ billId, invoiceRef }: { billId: string; invoiceRef: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await deleteWorkshopBillAction(billId);
      if (!result.ok) {
        toast.error(result.message);
        setOpen(false);
        router.refresh();
        return;
      }
      toast.success("Bill deleted");
      router.replace("/maintenance/bills");
      router.refresh();
    } catch {
      toast.error("Couldn't delete. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title="Delete this draft bill?"
        description={`Draft bill ${invoiceRef} will be removed from your workshop bills. This can't be undone from the app.`}
        confirmLabel="Delete bill"
        onConfirm={() => void handleConfirm()}
        loading={pending}
      />
    </>
  );
}
