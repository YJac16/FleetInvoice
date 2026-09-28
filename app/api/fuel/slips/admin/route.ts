import { NextResponse } from "next/server";

import { fuelSlipFieldsSchema } from "@/features/fuel/schemas/fuel-slip";
import { validateFuelSlipFile } from "@/lib/fuel/file-validation";
import { FUEL_SLIPS_BUCKET } from "@/lib/fuel/constants";
import { processComplianceStoragePurgeQueue } from "@/lib/compliance/process-storage-purge-queue";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildFuelSlipStoragePath,
  mimeToFuelExt,
  resolveFuelIsPlatformOwner,
  resolveFuelSlipAuth,
} from "@/services/fuel-slips.server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await request.formData();
  const organisationId = form.get("organisation_id");
  if (typeof organisationId !== "string") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isPlatformOwner = await resolveFuelIsPlatformOwner(user.id);
  const auth = await resolveFuelSlipAuth({
    userId: user.id,
    organisationId,
    isPlatformOwner,
    required: ["fuel:backcapture", "fuel:manage"],
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.code }, { status: auth.status });
  }

  const file = form.get("photo");
  const rawFields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key === "photo" || key === "organisation_id") continue;
    if (typeof value === "string") rawFields[key] = value;
  }

  const parsed = fuelSlipFieldsSchema.safeParse({
    ...rawFields,
    is_full_tank: rawFields.is_full_tank ?? "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  let photoJson: Record<string, unknown> | null = null;
  if (file instanceof File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = validateFuelSlipFile({ bytes, declaredMime: file.type });
    if (!validated.ok) {
      return NextResponse.json({ error: validated.code }, { status: validated.status });
    }
    const fillupId = crypto.randomUUID();
    const photoId = crypto.randomUUID();
    const ext = mimeToFuelExt(validated.mime);
    const storagePath = buildFuelSlipStoragePath({
      organisationId,
      fillupId,
      photoId,
      ext,
    });
    const { error: uploadError } = await admin.storage
      .from(FUEL_SLIPS_BUCKET)
      .upload(storagePath, bytes, { contentType: validated.mime, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }
    photoJson = {
      fillup_id: fillupId,
      id: photoId,
      storage_path: storagePath,
      mime_type: validated.mime,
      size_bytes: bytes.length,
      sha256: validated.sha256,
      bucket_id: FUEL_SLIPS_BUCKET,
    };
  }

  const fields = {
    filled_date: parsed.data.filled_at_local_date,
    filled_time: parsed.data.filled_at_local_time,
    litres: parsed.data.litres,
    unit_price: parsed.data.unit_price,
    total_amount: parsed.data.total_amount,
    fuel_type: parsed.data.fuel_type,
    slip_vrn: parsed.data.slip_vrn,
    slip_vrn_status: parsed.data.slip_vrn_status,
    odometer_km: parsed.data.odometer_km,
    authorisation_no: parsed.data.authorisation_no,
    order_no: parsed.data.order_no,
    pump_no: parsed.data.pump_no,
    station_name: parsed.data.station_name,
    station_vat_no: parsed.data.station_vat_no || null,
    slip_number: parsed.data.slip_number,
    is_full_tank: parsed.data.is_full_tank,
    notes: parsed.data.notes,
    driver_id: rawFields.driver_id ?? null,
  };

  const { data, error } = await admin.rpc("submit_fuel_slip", {
    p_actor: user.id,
    p_org: organisationId,
    p_client_entry_id: parsed.data.client_entry_id,
    p_vehicle_id: parsed.data.vehicle_id,
    p_fields: fields,
    p_photo: photoJson,
  });

  if (error) {
    if (photoJson?.storage_path) {
      await admin.storage
        .from(FUEL_SLIPS_BUCKET)
        .remove([String(photoJson.storage_path)]);
    }
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }

  try {
    await processComplianceStoragePurgeQueue(admin);
  } catch {
    return NextResponse.json({ error: "storage_purge_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fillup: data });
}
