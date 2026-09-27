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
    storage_mode: z.enum(["retained", "scan_discard"]).default("retained"),
    doc_type: z.string().optional(),
  })
  .strict();
