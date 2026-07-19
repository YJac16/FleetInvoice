import { z } from "zod";

export const pricingRuleFormSchema = z
  .object({
    companyId: z.string().uuid("Select a company"),
    pickupAreaId: z.string().uuid("Select a pickup area"),
    destinationAreaId: z.string().uuid("Select a destination area"),
    areasVisited: z.array(z.string().uuid()),
    minimumPassengers: z
      .number({ error: "Minimum passengers is required" })
      .int()
      .min(1)
      .max(60),
    maximumPassengers: z
      .number({ error: "Maximum passengers is required" })
      .int()
      .min(1)
      .max(60),
    vehicleId: z.string().uuid().optional().nullable().or(z.literal("")),
    price: z
      .number({ error: "Price is required" })
      .min(0, "Price cannot be negative"),
    priority: z
      .number({ error: "Priority is required" })
      .int()
      .min(0)
      .max(10_000),
    active: z.boolean(),
    ruleName: z.string().max(120).optional(),
  })
  .refine((value) => value.maximumPassengers >= value.minimumPassengers, {
    message: "Maximum must be greater than or equal to minimum",
    path: ["maximumPassengers"],
  });

export type PricingRuleFormValues = z.infer<typeof pricingRuleFormSchema>;

export const pricePreviewSchema = z.object({
  companyId: z.string().uuid("Select a company"),
  pickupArea: z.string().min(1, "Pickup is required"),
  destinationArea: z.string().min(1, "Destination is required"),
  areasVisited: z.array(z.string()),
  passengers: z.number().int().min(1).max(60),
  vehicleId: z.string().uuid("Select a vehicle"),
});

export type PricePreviewValues = z.infer<typeof pricePreviewSchema>;

export const priceOverrideSchema = z.object({
  newPrice: z.number({ error: "Price is required" }).min(0),
  reason: z
    .string()
    .trim()
    .min(3, "Reason is required (at least 3 characters)")
    .max(500),
});

export type PriceOverrideValues = z.infer<typeof priceOverrideSchema>;
