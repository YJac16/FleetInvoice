"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/card-grid-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";
import {
  computeSetupHealth,
  sastDate,
  type SetupHealth,
} from "@/features/setup-health/lib/setup-health";
import { loadSetupHealthData } from "@/services/setup-health.service";
import { getErrorMessage } from "@/utils/errors";

/** Read-only, per active org (follows the org switcher). */
export function SetupHealthPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const allowed = can("invoices:manage") && can("rate_cards:manage");

  const query = useQuery({
    queryKey: ["setup-health", organisationId],
    queryFn: () => loadSetupHealthData(organisationId!),
    enabled: Boolean(organisationId) && allowed,
  });

  const health = useMemo(
    () =>
      query.data
        ? computeSetupHealth({ ...query.data, today: sastDate(new Date().toISOString()) })
        : null,
    [query.data]
  );

  let body: React.ReactNode;
  if (!allowed) {
    body = <EmptyState icon={ShieldAlert} title="Admins only" description="Ask an org admin or manager for access." />;
  } else if (!organisationId) {
    body = <EmptyState title="Pick an organisation" description="Use the org switcher to choose one." />;
  } else if (query.isPending) {
    body = <CardGridSkeleton />;
  } else if (query.isError || !health) {
    body = (
      <EmptyState
        icon={CircleAlert}
        title="Couldn't load setup health"
        description={getErrorMessage(query.error)}
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  } else {
    body = <SetupHealthView health={health} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup health"
        description="What this organisation needs before trips can be invoiced."
      />
      {body}
    </div>
  );
}

export function SetupHealthView({ health }: { health: SetupHealth }) {
  const doneCount = health.checklist.filter((c) => c.done).length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Bill-to company"
          value={health.billTo?.name ?? "Not set"}
          note={health.billTo ? (health.billTo.explicit ? "Set in Settings" : "Default, not confirmed") : "Trips can't be invoiced"}
          tone={health.billTo?.explicit ? "ok" : "warn"}
          href="/settings#invoice-bill-to-card"
          cta={health.billTo?.explicit ? "Change" : "Set bill-to"}
        />
        <Metric
          label="Unbilled trips"
          value={String(health.unbilled.count)}
          note={
            health.unbilled.count === 0
              ? "Every completed trip is on an invoice"
              : `About ${formatZarAmount(health.unbilled.value)}${health.unbilled.unpriced ? `, ${health.unbilled.unpriced} without a rate` : ""}`
          }
          tone={health.unbilled.count === 0 ? "ok" : "warn"}
          href="/trips"
          cta="View trips"
        />
        <Metric
          label="Draft invoices"
          value={formatZarAmount(health.drafts.total)}
          note={`${health.drafts.count} draft${health.drafts.count === 1 ? "" : "s"} not yet issued`}
          tone="neutral"
          href="/invoices"
          cta="Review drafts"
        />
      </div>

      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle className="text-base">
            Setup checklist{" "}
            <span className="font-normal text-muted-foreground">
              {doneCount} of {health.checklist.length} done
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {health.checklist.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  {item.done ? (
                    <CheckCircle2 aria-label="Done" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleAlert aria-label="Needs attention" className="mt-0.5 size-5 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0 space-y-1 leading-normal">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                    {item.missing.length > 0 ? (
                      <p className="break-words text-sm text-muted-foreground">
                        {item.missing.slice(0, 5).join(", ")}
                        {item.missing.length > 5 ? ` and ${item.missing.length - 5} more` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                {!item.done ? (
                  <Button variant="outline" size="sm" className="self-start" render={<Link href={item.href} />}>
                    Fix this
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Unbilled value is an estimate from current trip rate cards. Numbers only include what your role can see.
      </p>
    </>
  );
}

function Metric(props: {
  label: string;
  value: string;
  note: string;
  tone: "ok" | "warn" | "neutral";
  href: string;
  cta: string;
}) {
  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent className="space-y-2 pt-6">
        <p className="text-sm text-muted-foreground">{props.label}</p>
        <p className="truncate text-2xl font-semibold tracking-tight" title={props.value}>{props.value}</p>
        <p className={props.tone === "warn" ? "text-sm text-amber-700" : "text-sm text-muted-foreground"}>
          {props.note}
        </p>
        <Link href={props.href} className="inline-block text-sm font-medium underline-offset-4 hover:underline">
          {props.cta}
        </Link>
      </CardContent>
    </Card>
  );
}
