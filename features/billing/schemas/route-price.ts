import { z } from "zod";

export const ROUTE_PRICE_MATCH_KINDS = [
  "exact",
  "anchor",
  "within",
  "either",
  "company",
] as const;

export const ROUTE_PRICE_MATCH_LABELS: Record<
  (typeof ROUTE_PRICE_MATCH_KINDS)[number],
  string
> = {
  exact: "Exact route",
  anchor: "One end fixed",
  within: "All stops in this area",
  either: "Either end is one of these places",
  company: "Any route (company flat)",
};

function placeLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const routePriceSchema = z
  .object({
    company_id: z.string().uuid("Select a company"),
    label: z.string().min(1, "Label is required").max(180),
    match_kind: z.enum(ROUTE_PRICE_MATCH_KINDS),
    stops_text: z.string().optional(),
    anchor_place: z.string().optional(),
    places_text: z.string().optional(),
    bidirectional: z.boolean(),
    unit_amount: z.string().min(1, "Amount is required"),
    priority: z.string().optional(),
    notes: z.string().optional(),
    active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const amount = Number(values.unit_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unit_amount"],
        message: "Amount must be zero or more",
      });
    }
    const stops = placeLines(values.stops_text);
    const places = placeLines(values.places_text);
    if (values.match_kind === "exact" && stops.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["stops_text"],
        message: "Enter at least two stops, one per line",
      });
    }
    if (values.match_kind === "anchor") {
      if (!values.anchor_place?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["anchor_place"],
          message: "Enter the fixed end",
        });
      }
      if (places.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["places_text"],
          message: "Enter at least one place for the other end",
        });
      }
    }
    if (
      (values.match_kind === "within" || values.match_kind === "either") &&
      places.length < 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["places_text"],
        message: "Enter at least one place",
      });
    }
  });

export type RoutePriceFormValues = z.infer<typeof routePriceSchema>;

export function placesToText(values: string[] | null | undefined): string {
  return (values ?? []).join("\n");
}

export { placeLines };
