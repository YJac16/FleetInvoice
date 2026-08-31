"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { InvoicePrintView } from "@/features/invoices/components/invoice-print-view";
import { parseInvoicePrintSettings } from "@/features/invoices/lib/invoice-print-settings";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { getCompany } from "@/services/companies.service";
import {
  getInvoice,
  listInvoiceLinesWithTrips,
} from "@/services/invoices.service";
import { getOrganisation } from "@/services/organisations.service";
import { queryKeys } from "@/utils/query";

export function InvoicePrintPage({
  invoiceId,
  backHref,
}: {
  invoiceId: string;
  backHref: string;
}) {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("invoices:view");

  const orgQuery = useQuery({
    queryKey: organisationId
      ? ["organisation", organisationId]
      : ["organisation", "none"],
    queryFn: () => getOrganisation(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const invoiceQuery = useQuery({
    queryKey:
      organisationId && invoiceId
        ? [...queryKeys.invoices(organisationId), invoiceId]
        : ["invoice", "none"],
    queryFn: () => getInvoice(organisationId!, invoiceId),
    enabled: Boolean(organisationId && invoiceId) && canView,
  });

  const companyQuery = useQuery({
    queryKey:
      organisationId && invoiceQuery.data?.company_id
        ? ["company", organisationId, invoiceQuery.data.company_id]
        : ["company", "none"],
    queryFn: () =>
      getCompany(organisationId!, invoiceQuery.data!.company_id),
    enabled: Boolean(organisationId && invoiceQuery.data?.company_id) && canView,
  });

  const linesQuery = useQuery({
    queryKey:
      organisationId && invoiceId
        ? queryKeys.invoiceLines(organisationId, invoiceId)
        : ["invoice-lines", "none"],
    queryFn: () => listInvoiceLinesWithTrips(organisationId!, invoiceId),
    enabled: Boolean(organisationId && invoiceId) && canView,
  });

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        description="You do not have permission to view invoices."
      />
    );
  }

  if (!organisationId) {
    return (
      <EmptyState
        title="No organisation"
        description="Select an organisation to print invoices."
      />
    );
  }

  if (
    orgQuery.isLoading ||
    invoiceQuery.isLoading ||
    linesQuery.isLoading ||
    companyQuery.isLoading
  ) {
    return (
      <div className="p-6">
        <LoadingSkeleton rows={8} />
      </div>
    );
  }

  const invoice = invoiceQuery.data;
  const organisation = orgQuery.data;

  if (!invoice || !organisation) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState
          title="Invoice not found"
          description="This invoice is missing or you cannot access it."
        />
        <Link href={backHref} className="text-sm underline">
          Back to invoices
        </Link>
      </div>
    );
  }

  return (
    <InvoicePrintView
      organisation={organisation}
      company={companyQuery.data ?? null}
      invoice={invoice}
      lines={linesQuery.data ?? []}
      printSettings={parseInvoicePrintSettings(organisation)}
      backHref={backHref}
    />
  );
}
