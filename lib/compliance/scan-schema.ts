import { z } from "zod";

export const complianceScanBodySchema = z
  .object({
    subject_kind: z.enum([
      "driver_licence",
      "prdp",
      "vehicle_disc",
      "operating_permit",
      "registration_certificate",
    ]),
    subject_id: z.string().uuid(),
    document_id: z.string().uuid().optional(),
    temp_scan_id: z.string().uuid().optional(),
    storage_mode: z.enum(["retained", "scan_discard"]).default("retained"),
    doc_type: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.storage_mode === "scan_discard" && !value.temp_scan_id) {
      ctx.addIssue({ code: "custom", message: "temp_scan_id required" });
    }
    if (value.storage_mode === "retained" && !value.document_id) {
      ctx.addIssue({ code: "custom", message: "document_id required" });
    }
  });
