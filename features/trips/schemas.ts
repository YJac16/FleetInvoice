import { z } from "zod";

export const tripFormSchema = z.object({
  tripDate: z.string().min(1, "Date is required"),
  tripTime: z.string().min(1, "Time is required"),
  companyId: z
    .string()
    .min(1, "Select a company")
    .uuid("Select a company"),
  vehicleId: z
    .string()
    .min(1, "Select a vehicle")
    .uuid("Select a vehicle"),
  pickupArea: z.string().min(1, "Pickup area is required"),
  destinationArea: z.string().min(1, "Destination area is required"),
  areasVisited: z.array(z.string()),
  passengers: z
    .number({ error: "Passengers is required" })
    .int("Passengers must be a whole number")
    .min(1, "At least 1 passenger")
    .max(60, "Maximum 60 passengers"),
  notes: z.string().max(2000, "Notes are too long").optional(),
});

export type TripFormValues = z.infer<typeof tripFormSchema>;

export const tripStepFields: Record<number, (keyof TripFormValues)[]> = {
  1: ["tripDate", "tripTime", "companyId", "vehicleId"],
  2: ["pickupArea", "destinationArea", "areasVisited"],
  3: ["passengers", "notes"],
  4: [],
};
