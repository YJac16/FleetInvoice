"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listActiveCompanies } from "@/services/companies.service";
import {
  getOrgInvoiceBillTo,
  setOrgInvoiceBillTo,
} from "@/services/organisations.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

type Props = { organisationId: string };

/** Settings → Invoicing → Bill-to company. Rendered for org admins only. */
export function InvoiceBillToSettings({ organisationId }: Props) {
  const queryClient = useQueryClient();
  const billToKey = ["organisations", organisationId, "invoice-bill-to"];

  const billToQuery = useQuery({
    queryKey: billToKey,
    queryFn: () => getOrgInvoiceBillTo(organisationId),
  });
  const companiesQuery = useQuery({
    queryKey: ["companies", organisationId, "active"],
    queryFn: () => listActiveCompanies(organisationId),
  });

  const [selected, setSelected] = useState("");
  useEffect(() => {
    setSelected(billToQuery.data?.company_id ?? "");
  }, [billToQuery.data]);

  const mutation = useMutation({
    mutationFn: (companyId: string) =>
      setOrgInvoiceBillTo(organisationId, companyId),
    onSuccess: async (retargeted) => {
      await queryClient.invalidateQueries({ queryKey: billToKey });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organisation(organisationId),
      });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        retargeted > 0
          ? `Bill-to company saved. ${retargeted} draft invoice${retargeted === 1 ? "" : "s"} updated.`
          : "Bill-to company saved"
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const companies = companiesQuery.data ?? [];
  const current = billToQuery.data;
  const unchanged = !selected || selected === current?.company_id;

  return (
    <Card id="invoice-bill-to-card" className="max-w-2xl scroll-mt-20">
      <CardHeader>
        <CardTitle>Invoicing</CardTitle>
        <CardDescription>
          The company driver trips are invoiced to. Changing it updates draft
          invoices only; issued, paid and void invoices are never changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invoice-bill-to">Bill-to company</Label>
          <Select
            value={selected}
            onValueChange={(value) => setSelected(value ?? "")}
          >
            <SelectTrigger id="invoice-bill-to" className="w-full">
              <SelectValue placeholder="Select an active company">
                {companies.find((c) => c.id === selected)?.name ??
                  current?.company_name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {current
              ? current.is_explicit
                ? `Currently ${current.company_name}.`
                : `Currently ${current.company_name} (default, not yet set explicitly).`
              : "Not set. Completed trips cannot be invoiced until a bill-to company is chosen."}
          </p>
        </div>
        <Button
          type="button"
          disabled={unchanged || mutation.isPending}
          onClick={() => mutation.mutate(selected)}
        >
          {mutation.isPending ? "Saving…" : "Save bill-to company"}
        </Button>
      </CardContent>
    </Card>
  );
}
