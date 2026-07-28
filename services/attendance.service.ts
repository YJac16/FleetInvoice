import { createClient } from "@/lib/supabase/client";
import type {
  AttendanceEvent,
  AttendanceEventType,
  IssuedQrPayload,
  QrToken,
  Trip,
} from "@/types";

const EVENTS_SELECT =
  "*, employees:employee_id (id, full_name, email), trips:trip_id (id, planned_start, status, routes:route_id (id, name))";

const TOKENS_SELECT =
  "*, employees:employee_id (id, full_name, email), trips:trip_id (id, planned_start, status)";

function parseIssuedQr(data: unknown): IssuedQrPayload {
  if (typeof data === "string") {
    return {
      token: data,
      backup_code: "",
      expires_at: "",
      qr_token_id: "",
    };
  }
  const obj = data as IssuedQrPayload;
  return {
    token: obj.token,
    backup_code: obj.backup_code ?? "",
    expires_at: obj.expires_at ?? "",
    qr_token_id: String(obj.qr_token_id ?? ""),
  };
}

export async function issueQrToken(input: {
  organisationId: string;
  tripId: string;
  employeeId: string;
  ttlMinutes?: number;
}): Promise<IssuedQrPayload> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("issue_qr_token", {
    p_organisation_id: input.organisationId,
    p_trip_id: input.tripId,
    p_employee_id: input.employeeId,
    p_ttl_minutes: input.ttlMinutes ?? 120,
  });
  if (error) throw error;
  return parseIssuedQr(data);
}

export async function scanQrToken(input: {
  token: string;
  eventType?: Exclude<AttendanceEventType, "issued">;
  notes?: string | null;
}): Promise<AttendanceEvent> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("scan_qr_token", {
    p_token: input.token.trim(),
    p_event_type: input.eventType ?? "boarded",
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as AttendanceEvent;
}

export async function recordManualBoarding(input: {
  organisationId: string;
  tripId: string;
  employeeId: string;
  notes?: string | null;
}): Promise<AttendanceEvent> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("record_manual_boarding", {
    p_organisation_id: input.organisationId,
    p_trip_id: input.tripId,
    p_employee_id: input.employeeId,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as AttendanceEvent;
}

export async function listAttendanceEvents(
  organisationId: string
): Promise<AttendanceEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select(EVENTS_SELECT)
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as AttendanceEvent[]) ?? [];
}

export async function getCurrentEmployeeId(
  organisationId: string
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Upcoming / active trips for the signed-in employee (same company, or all
 * org trips when the employee has no company).
 */
export async function listMyEmployeeTrips(
  organisationId: string
): Promise<Trip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("id, company_id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (empError) throw empError;
  if (!emp) return [];

  let query = supabase
    .from("trips")
    .select("*, routes:route_id (id, name)")
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .in("status", ["planned", "assigned", "in_progress"])
    .order("planned_start", { ascending: true })
    .limit(50);

  if (emp.company_id) {
    query = query.or(`company_id.eq.${emp.company_id},company_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as Trip[]) ?? [];
}

export async function listMyQrTokens(
  organisationId: string
): Promise<QrToken[]> {
  const employeeId = await getCurrentEmployeeId(organisationId);
  if (!employeeId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("qr_tokens")
    .select(TOKENS_SELECT)
    .eq("organisation_id", organisationId)
    .eq("employee_id", employeeId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as unknown as QrToken[]) ?? [];
}

export async function listMyAttendanceEvents(
  organisationId: string
): Promise<AttendanceEvent[]> {
  const employeeId = await getCurrentEmployeeId(organisationId);
  if (!employeeId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select(EVENTS_SELECT)
    .eq("organisation_id", organisationId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as AttendanceEvent[]) ?? [];
}
