import type { Profile, UserRole } from "@/types/database";

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile | null;
}

export interface SessionContext {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  /** drivers.id when a driver record exists for this profile. */
  driverId: string | null;
  /** Optional default vehicle from the driver record. */
  defaultVehicleId: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface ForgotPasswordPayload {
  email: string;
}
