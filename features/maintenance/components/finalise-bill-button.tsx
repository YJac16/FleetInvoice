"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { finaliseWorkshopBillAction } from "@/features/maintenance/actions";

/** Draft bills only; the page decides whether to render it. One-way: no reopen. */
export function FinaliseBillButton({ billId }: { billId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await finaliseWorkshopBillAction(billId);
      if (!result.ok) {
        toast.error(result.message);
        setOpen(false);
        router.refresh();
        return;
      }
      toast.success("Bill finalised");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Couldn't finalise. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Lock className="size-4" /> Finalise
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title="Finalise bill?"
        description="It can't be edited or deleted afterwards."
        confirmLabel="Finalise bill"
        onConfirm={() => void handleConfirm()}
        loading={pending}
      />
    </>
  );
}
