"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-3">
          <DialogHeader className="pr-14">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="min-w-0 space-y-4 py-2 max-sm:[&_input]:min-h-11 max-sm:[&_textarea]:min-h-11 max-sm:[&_[data-slot=select-trigger]]:min-h-11">
            {children}
          </div>
        </div>
        {footer ? (
          <DialogFooter className="mx-0 mb-0 shrink-0">{footer}</DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
