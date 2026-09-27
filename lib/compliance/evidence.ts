import { z } from "zod";

const bboxEvidence = z.object({
  page: z.number().int().min(0),
  bbox: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
});

const fieldRefEvidence = z.object({
  field_ref: z.enum([
    "licence_card.valid_to",
    "licence_card.number",
    "licence_disc.expires_on",
    "operating_permit.number",
    "registration.number",
  ]),
});

export type NormalisedEvidence =
  | z.infer<typeof bboxEvidence>
  | z.infer<typeof fieldRefEvidence>
  | null;

export function normaliseEvidence(raw: unknown): {
  evidence: NormalisedEvidence;
  droppedText: boolean;
} {
  if (raw == null) return { evidence: null, droppedText: false };
  if (typeof raw === "string") {
    return { evidence: null, droppedText: true };
  }
  const bbox = bboxEvidence.safeParse(raw);
  if (bbox.success) return { evidence: bbox.data, droppedText: false };
  const fieldRef = fieldRefEvidence.safeParse(raw);
  if (fieldRef.success) return { evidence: fieldRef.data, droppedText: false };
  return { evidence: null, droppedText: true };
}
