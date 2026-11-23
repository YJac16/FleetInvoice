import { NextResponse } from "next/server";

import { buildBillsCsv, exportFilename, parseExportFilters } from "@/features/maintenance/lib/bills-csv";
import { listBillLinesForExport } from "@/features/maintenance/lib/queries";
import { assertMaintenanceAccess } from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: Record<string, unknown>, status: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * GET /api/maintenance/bills/export?from=YYYY-MM-DD&to=YYYY-MM-DD[&vehicle=uuid][&supplier=uuid]
 *
 * CSV of workshop bill lines for the caller's active organisation. The org
 * comes from the session, never from the request. Needs maintenance 'view'.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return json({ error: "unauthenticated" }, 401);
  const organisationId = session.activeOrganisationId;
  if (!organisationId) return json({ error: "no_active_org" }, 403);

  const access = await assertMaintenanceAccess("view", { organisationId, userId: session.userId });
  if (!access.ok) return json({ error: access.error }, access.status);

  const parsed = parseExportFilters(new URL(request.url).searchParams);
  if (!parsed.ok) return json({ error: "invalid_filters", fieldErrors: parsed.fieldErrors }, 400);

  const result = await listBillLinesForExport(organisationId, parsed.filters);
  if (!result.ok) return json({ error: result.error }, 422);

  return new Response(buildBillsCsv(result.rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(parsed.filters)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
