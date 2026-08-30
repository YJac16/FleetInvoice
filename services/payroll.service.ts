import { createClient } from "@/lib/supabase/client";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { PayrollLine, PayrollRun } from "@/types";

export { mondayOfWeek, weekPeriodEnd } from "@/features/invoices/lib/week";

const RUNS_TABLE = "payroll_runs";

export function listPayrollRuns(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<PayrollRun>(RUNS_TABLE, organisationId, {
    orderBy: "period_start",
    ...options,
  });
}

export async function listPayrollLines(
  organisationId: string,
  runId: string
): Promise<PayrollLine[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payroll_lines")
    .select(
      "*, drivers:driver_id (id, full_name), employees:employee_id (id, full_name)"
    )
    .eq("organisation_id", organisationId)
    .eq("payroll_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PayrollLine[];
}

export async function generatePayrollRun(
  organisationId: string,
  periodStart: string,
  periodEnd: string
): Promise<PayrollRun> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_payroll_run", {
    p_organisation_id: organisationId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw error;
  return data as PayrollRun;
}

export async function finalizePayrollRun(runId: string): Promise<PayrollRun> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("finalize_payroll_run", {
    p_run_id: runId,
  });
  if (error) throw error;
  return data as PayrollRun;
}

export async function voidPayrollRun(runId: string): Promise<PayrollRun> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("void_payroll_run", {
    p_run_id: runId,
  });
  if (error) throw error;
  return data as PayrollRun;
}
