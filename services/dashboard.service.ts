import { createClient } from "@/lib/supabase/client";
import type { DashboardCounts } from "@/types";

async function countRows(
  table: string,
  organisationId: string,
  column = "id"
): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardCounts(
  organisationId: string
): Promise<DashboardCounts> {
  const [
    drivers,
    employees,
    vehicles,
    companies,
    sites,
    pickup_points,
    users,
  ] = await Promise.all([
    countRows("drivers", organisationId),
    countRows("employees", organisationId),
    countRows("vehicles", organisationId),
    countRows("companies", organisationId),
    countRows("sites", organisationId),
    countRows("pickup_points", organisationId),
    countRows("organisation_members", organisationId),
  ]);

  return {
    drivers,
    employees,
    vehicles,
    companies,
    sites,
    pickup_points,
    users,
  };
}
