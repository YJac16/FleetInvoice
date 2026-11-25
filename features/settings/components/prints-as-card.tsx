"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PRINT_OWNER_KEYS,
  resolveInvoicePrintSettings,
  resolvePrintSupplierName,
} from "@/features/invoices/lib/invoice-print-settings";
import {
  ownerBlockFromForm,
  ownerBlockToForm,
  setOwnerBlock,
  type OwnerPrintForm,
} from "@/features/settings/lib/owner-print-form";
import { OWNER_LABELS } from "@/lib/owner-tag";
import { updateOrganisation } from "@/services/organisations.service";
import type { Organisation } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const FIELDS: { key: keyof OwnerPrintForm; label: string }[] = [
  { key: "issuer_name", label: "Issuer name" },
  { key: "bank", label: "Bank" },
  { key: "account_name", label: "Account name" },
  { key: "account_number", label: "Account number" },
  { key: "branch_code", label: "Branch code" },
  { key: "account_type", label: "Account type" },
];

function maskAccount(value: string | undefined): string {
  if (!value) return "no account set";
  return value.length <= 4 ? value : `••••${value.slice(-4)}`;
}

/** Shows who each owner's invoices print as, and edits the owner issuer blocks. */
export function PrintsAsCard({ organisation }: { organisation: Organisation }) {
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<Record<string, OwnerPrintForm>>({});

  useEffect(() => {
    setForms(
      Object.fromEntries(
        PRINT_OWNER_KEYS.map((o) => [o, ownerBlockToForm(organisation, o)])
      )
    );
  }, [organisation]);

  const mutation = useMutation({
    mutationFn: async () => {
      let settings: Record<string, unknown> = organisation.settings ?? {};
      for (const o of PRINT_OWNER_KEYS) {
        settings = setOwnerBlock(settings, o, ownerBlockFromForm(forms[o]));
      }
      return updateOrganisation(organisation.id, { settings });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organisation(organisation.id),
      });
      toast.success("Prints-as issuers saved");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rows = [...PRINT_OWNER_KEYS, "unassigned" as const].map((o) => {
    const s = resolveInvoicePrintSettings(organisation, o, null);
    return {
      owner: o,
      issuer: resolvePrintSupplierName(s, organisation.name),
      account: maskAccount(s.banking?.account_number),
    };
  });

  return (
    <Card className="max-w-2xl" data-testid="prints-as-card">
      <CardHeader>
        <CardTitle>Prints as</CardTitle>
        <CardDescription>
          Issuer and banking printed on invoices by owner. A driver&apos;s own
          issuer override wins; unassigned invoices use the organisation issuer
          above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.owner} className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">{OWNER_LABELS[r.owner]}</span>
              <span className="text-muted-foreground">
                {r.issuer} · {r.account}
              </span>
            </li>
          ))}
        </ul>

        {PRINT_OWNER_KEYS.map((o) => (
          <div key={o} className="space-y-3">
            <p className="text-sm font-medium">{OWNER_LABELS[o]} issuer</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`prints-as-${o}-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`prints-as-${o}-${f.key}`}
                    value={forms[o]?.[f.key] ?? ""}
                    onChange={(e) =>
                      setForms((prev) => ({
                        ...prev,
                        [o]: { ...prev[o], [f.key]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save prints-as issuers"}
        </Button>
      </CardContent>
    </Card>
  );
}
