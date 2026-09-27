import type { Driver } from "@/types";
import type { Vehicle } from "@/types";

async function parseCaptureResponse(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "capture_save_failed");
  }
  return body;
}

export async function saveDriverCapture(input: {
  organisationId: string;
  fields: Record<string, unknown>;
  driverId?: string;
}): Promise<Driver> {
  const url = input.driverId
    ? `/api/capture/drivers/${input.driverId}`
    : "/api/capture/drivers";
  const res = await fetch(url, {
    method: input.driverId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: input.organisationId,
      fields: input.fields,
    }),
  });
  const body = await parseCaptureResponse(res);
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", body.id!)
    .single();
  if (error || !data) throw error ?? new Error("driver_reload_failed");
  return data as Driver;
}

export async function saveVehicleCapture(input: {
  organisationId: string;
  fields: Record<string, unknown>;
  vehicleId?: string;
}): Promise<Vehicle> {
  const url = input.vehicleId
    ? `/api/capture/vehicles/${input.vehicleId}`
    : "/api/capture/vehicles";
  const res = await fetch(url, {
    method: input.vehicleId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: input.organisationId,
      fields: input.fields,
    }),
  });
  const body = await parseCaptureResponse(res);
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", body.id!)
    .single();
  if (error || !data) throw error ?? new Error("vehicle_reload_failed");
  return data as Vehicle;
}
