"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DriverCaptureForm } from "@/features/drivers/components/driver-capture-form";
import { useComplianceScanAssist } from "@/hooks/use-compliance-scan-assist";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { createDriver, updateDriver } from "@/services/drivers.service";
import { listMembers } from "@/services/users.service";
import type { Driver } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

export function DriverCaptureScreen({ driverId }: { driverId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("drivers:manage");
  const scanAssist = useComplianceScanAssist(organisationId);

  const driverQuery = useQuery({
    queryKey: ["driver-capture", organisationId, driverId] as const,
    queryFn: async () => {
      if (!organisationId || !driverId) return null;
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId)
        .eq("organisation_id", organisationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Driver | null;
    },
    enabled: Boolean(organisationId && driverId),
  });

  const membersQuery = useQuery({
    queryKey: organisationId ? queryKeys.members(organisationId) : ["members", "none"],
    queryFn: () => listMembers(organisationId!),
    enabled: Boolean(organisationId),
  });

  const profileOptions = useMemo(() => {
    const options = [{ label: "None", value: "" }];
    for (const member of membersQuery.data ?? []) {
      const profile = member.profiles;
      if (!profile) continue;
      options.push({
        value: profile.id,
        label: profile.full_name || profile.email || profile.id.slice(0, 8),
      });
    }
    return options;
  }, [membersQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!organisationId) throw new Error("No organisation");
      if (driverId) {
        return updateDriver(driverId, values as Partial<Driver>);
      }
      return createDriver(organisationId, values as Parameters<typeof createDriver>[1]);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.drivers(organisationId!) });
      toast.success(driverId ? "Driver updated" : "Driver created");
      if (!driverId && saved?.id) {
        router.replace(`/drivers/${saved.id}/capture`);
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!canManage) {
    return (
      <EmptyState
        title="Access denied"
        description="Only organisation admins and ops roles can capture driver details."
      />
    );
  }

  if (!organisationId) {
    return <LoadingSkeleton rows={6} />;
  }

  if (driverId && driverQuery.isLoading) {
    return <LoadingSkeleton rows={8} />;
  }

  if (driverId && !driverQuery.data) {
    return (
      <EmptyState title="Driver not found" description="This driver may belong to another organisation." />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={driverId ? "Edit driver capture" : "New driver capture"}
        description="Manual fields and document photos. AI scan-assist stays off unless explicitly enabled for your org."
        actions={
          <Button variant="outline" size="sm" render={<Link href="/drivers" />}>
            Back to list
          </Button>
        }
      />
      <DriverCaptureForm
        initial={driverQuery.data ?? undefined}
        profileOptions={profileOptions}
        scanAssistEnabled={scanAssist.data === true}
        submitting={saveMutation.isPending}
        submitLabel={driverId ? "Save changes" : "Create driver"}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}
