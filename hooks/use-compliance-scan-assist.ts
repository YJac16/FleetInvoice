"use client";

import { useQuery } from "@tanstack/react-query";

import { isComplianceScanAssistActive } from "@/lib/compliance/scan-assist";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/utils/query";

/** Scan-assist off by default (org flag false; env flag unset on Hobby). */
export function useComplianceScanAssist(organisationId: string | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.organisation(organisationId ?? ""), "compliance-scan-assist"],
    queryFn: async () => {
      if (!organisationId) return false;
      const supabase = createClient();
      const { data } = await supabase
        .from("organisations")
        .select("compliance_scan_enabled")
        .eq("id", organisationId)
        .maybeSingle();
      return isComplianceScanAssistActive(data?.compliance_scan_enabled);
    },
    enabled: Boolean(organisationId),
    staleTime: 60_000,
  });
}
