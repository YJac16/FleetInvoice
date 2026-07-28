import { z } from "zod";

export const geofenceSchema = z.object({
  name: z.string().min(2, "Name is required"),
  center_lat: z.string().min(1, "Latitude is required"),
  center_lng: z.string().min(1, "Longitude is required"),
  radius_m: z.string().min(1, "Radius is required"),
  site_id: z.string().optional(),
  pickup_point_id: z.string().optional(),
  is_active: z.enum(["true", "false"]),
});

export type GeofenceValues = z.infer<typeof geofenceSchema>;
