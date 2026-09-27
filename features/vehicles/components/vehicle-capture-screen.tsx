"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { VehicleCaptureForm } from "@/features/vehicles/components/vehicle-capture-form";
import { useComplianceScanAssist } from "@/hooks/use-compliance-scan-assist";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { createVehicle, updateVehicle } from "@/services/vehicles.service";
import type { Vehicle } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const NONE = "none";

export function VehicleCaptureScreen({ vehicleId }: { vehicleId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("vehicles:manage");
  const scanAssist = useComplianceScanAssist(organisationId);
  const { companies } = useEntityOptions(organisationId);

  const companyOptions = [{ label: "None", value: NONE }, ...companies];

  const vehicleQuery = useQuery({
    queryKey: ["vehicle-capture", organisationId, vehicleId] as const,
    queryFn: async () => {
      if (!organisationId || !vehicleId) return null;
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .eq("organisation_id", organisationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Vehicle | null;
    },
    enabled: Boolean(organisationId && vehicleId),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!organisationId) throw new Error("No organisation");
      if (vehicleId) {
        return updateVehicle(vehicleId, values as Partial<Vehicle>);
      }
      return createVehicle(organisationId, values as Parameters<typeof createVehicle>[1]);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.vehicles(organisationId!) });
      toast.success(vehicleId ? "Vehicle updated" : "Vehicle created");
      if (!vehicleId && saved?.id) {
        router.replace(`/vehicles/${saved.id}/capture`);
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!canManage) {
    return (
      <EmptyState
        title="Access denied"
        description="Only organisation admins and ops roles can capture vehicle details."
      />
    );
  }

  if (!organisationId) {
    return <LoadingSkeleton rows={6} />;
  }

  if (vehicleId && vehicleQuery.isLoading) {
    return <LoadingSkeleton rows={8} />;
  }

  if (vehicleId && !vehicleQuery.data) {
    return (
      <EmptyState title="Vehicle not found" description="This vehicle may belong to another organisation." />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={vehicleId ? "Edit vehicle capture" : "New vehicle capture"}
        description="Enter NaTIS and fleet fields manually. Licence disc photos are optional; RC images are never stored."
        actions={
          <Button variant="outline" size="sm" render={<Link href="/vehicles" />}>
            Back to list
          </Button>
        }
      />
      <VehicleCaptureForm
        initial={vehicleQuery.data ?? undefined}
        companies={companyOptions}
        scanAssistEnabled={scanAssist.data === true}
        submitting={saveMutation.isPending}
        submitLabel={vehicleId ? "Save changes" : "Create vehicle"}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}
