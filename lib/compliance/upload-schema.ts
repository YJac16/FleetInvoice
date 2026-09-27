import { z } from "zod";

export const complianceUploadFieldsSchema = z
  .object({
    subject_kind: z.enum(["driver", "vehicle"]),
    subject_id: z.string().uuid(),
    doc_type: z.string().min(1),
    side: z.enum(["front", "back", "single"]).default("single"),
    storage_mode: z.enum(["retained", "scan_discard"]).default("retained"),
  })
  .strict();

export type ComplianceUploadFields = z.infer<typeof complianceUploadFieldsSchema>;
