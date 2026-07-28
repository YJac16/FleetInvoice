import type {
  AppRole,
  EntityStatus,
  InvitationStatus,
  InvoiceLineType,
  InvoiceStatus,
  MembershipStatus,
  PayRateUnit,
  PaySubjectRole,
  PayrollLineType,
  PayrollRunStatus,
  RateCardUnit,
  TripEventType,
  TripStatus,
  VehicleDocType,
  VehicleType,
} from "@/lib/constants";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_platform_owner: boolean;
  created_at: string;
  updated_at: string;
};

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type OrganisationMember = {
  id: string;
  organisation_id: string;
  user_id: string;
  role: AppRole;
  status: MembershipStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profiles?: Pick<Profile, "id" | "email" | "full_name" | "avatar_url" | "phone"> | null;
};

export type Invitation = {
  id: string;
  organisation_id: string;
  email: string;
  role: AppRole;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  invited_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Company = {
  id: string;
  organisation_id: string;
  name: string;
  code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Area = {
  id: string;
  organisation_id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Site = {
  id: string;
  organisation_id: string;
  company_id: string | null;
  area_id: string | null;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PickupPoint = {
  id: string;
  organisation_id: string;
  site_id: string | null;
  area_id: string | null;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Driver = {
  id: string;
  organisation_id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profiles?: Pick<Profile, "id" | "email" | "full_name"> | null;
};

export type Employee = {
  id: string;
  organisation_id: string;
  company_id: string | null;
  site_id: string | null;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  employee_number: string | null;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profiles?: Pick<Profile, "id" | "email" | "full_name"> | null;
  companies?: Pick<Company, "id" | "name"> | null;
  sites?: Pick<Site, "id" | "name" | "address" | "latitude" | "longitude"> | null;
};

export type TripPassengerDirection = "to_work" | "from_work";
export type TripPassengerStatus =
  | "requested"
  | "confirmed"
  | "cancelled"
  | "boarded";

export type TripPassenger = {
  id: string;
  organisation_id: string;
  trip_id: string;
  employee_id: string;
  direction: TripPassengerDirection;
  status: TripPassengerStatus;
  requested_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  boarded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employees?: (Pick<
    Employee,
    | "id"
    | "full_name"
    | "email"
    | "phone"
    | "home_address"
    | "home_latitude"
    | "home_longitude"
    | "company_id"
    | "site_id"
  > & {
    companies?: { id: string; name: string } | null;
    sites?: {
      id: string;
      name: string;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }) | null;
  trips?: (Pick<Trip, "id" | "planned_start" | "status"> & {
    routes?: { id: string; name: string } | null;
  }) | null;
};

export type AttendanceEventType =
  | "issued"
  | "boarded"
  | "confirmed"
  | "rejected";

export type QrToken = {
  id: string;
  organisation_id: string;
  trip_id: string;
  employee_id: string;
  token_hash: string;
  backup_code_hash?: string | null;
  expires_at: string;
  used_at: string | null;
  issued_by: string | null;
  created_at: string;
  employees?: Pick<Employee, "id" | "full_name" | "email"> | null;
  trips?: Pick<Trip, "id" | "planned_start" | "status"> | null;
};

export type IssuedQrPayload = {
  token: string;
  backup_code: string;
  expires_at: string;
  qr_token_id: string;
};

export type AttendanceEvent = {
  id: string;
  organisation_id: string;
  trip_id: string;
  employee_id: string;
  qr_token_id: string | null;
  event_type: AttendanceEventType;
  recorded_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  employees?: Pick<Employee, "id" | "full_name" | "email"> | null;
  trips?: (Pick<Trip, "id" | "planned_start" | "status"> & {
    routes?: Pick<Route, "id" | "name"> | null;
  }) | null;
};

export type Vehicle = {
  id: string;
  organisation_id: string;
  company_id: string | null;
  name: string;
  registration_number: string | null;
  vehicle_type: VehicleType;
  capacity: number | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies?: Pick<Company, "id" | "name"> | null;
};

export type FuelFillup = {
  id: string;
  organisation_id: string;
  vehicle_id: string;
  driver_id: string | null;
  company_id: string | null;
  filled_at: string;
  odometer_km: number;
  litres: number;
  unit_price: number | null;
  total_amount: number | null;
  currency: string;
  station_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  vehicles?: Pick<Vehicle, "id" | "name" | "registration_number"> | null;
  companies?: Pick<Company, "id" | "name"> | null;
  drivers?: Pick<Driver, "id" | "full_name"> | null;
};

export type Invoice = {
  id: string;
  organisation_id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  total: number;
  notes: string | null;
  generated_by: string | null;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies?: Pick<Company, "id" | "name"> | null;
};

export type InvoiceLine = {
  id: string;
  organisation_id: string;
  invoice_id: string;
  line_type: InvoiceLineType;
  fuel_fillup_id: string | null;
  rate_card_id: string | null;
  trip_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  created_at: string;
};

export type RateCard = {
  id: string;
  organisation_id: string;
  company_id: string | null;
  name: string;
  line_type: Exclude<InvoiceLineType, "fuel">;
  unit: RateCardUnit;
  unit_amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies?: Pick<Company, "id" | "name"> | null;
};

export type PayRate = {
  id: string;
  organisation_id: string;
  company_id: string | null;
  name: string;
  subject_role: PaySubjectRole;
  unit: PayRateUnit;
  unit_amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies?: Pick<Company, "id" | "name"> | null;
};

export type PayrollRun = {
  id: string;
  organisation_id: string;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  currency: string;
  total: number;
  notes: string | null;
  generated_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PayrollLine = {
  id: string;
  organisation_id: string;
  payroll_run_id: string;
  line_type: PayrollLineType;
  driver_id: string | null;
  employee_id: string | null;
  pay_rate_id: string | null;
  trip_id: string | null;
  attendance_event_id: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  created_at: string;
  drivers?: Pick<Driver, "id" | "full_name"> | null;
  employees?: Pick<Employee, "id" | "full_name"> | null;
};
export type VehicleDocument = {
  id: string;
  organisation_id: string;
  vehicle_id: string;
  name: string;
  doc_type: VehicleDocType;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  expires_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Route = {
  id: string;
  organisation_id: string;
  company_id: string | null;
  area_id: string | null;
  name: string;
  code: string | null;
  description: string | null;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RouteStop = {
  id: string;
  organisation_id: string;
  route_id: string;
  sequence: number;
  site_id: string | null;
  pickup_point_id: string | null;
  label: string | null;
  dwell_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Schedule = {
  id: string;
  organisation_id: string;
  route_id: string;
  name: string;
  days_of_week: number[];
  depart_time: string;
  effective_from: string;
  effective_to: string | null;
  timezone: string;
  status: EntityStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Trip = {
  id: string;
  organisation_id: string;
  route_id: string;
  schedule_id: string | null;
  company_id: string | null;
  planned_start: string;
  planned_end: string | null;
  status: TripStatus;
  generation_key: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  routes?: Pick<Route, "id" | "name"> | null;
  trip_assignments?: TripAssignment[];
};

export type TripAssignment = {
  id: string;
  organisation_id: string;
  trip_id: string;
  driver_id: string;
  vehicle_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  released_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  drivers?: Pick<Driver, "id" | "full_name"> | null;
  vehicles?: Pick<
    Vehicle,
    "id" | "name" | "registration_number" | "capacity"
  > | null;
};

export type TripEvent = {
  id: string;
  organisation_id: string;
  trip_id: string;
  assignment_id: string | null;
  event_type: TripEventType;
  actor_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MembershipWithOrg = OrganisationMember & {
  organisations: Pick<Organisation, "id" | "name" | "slug" | "status"> | null;
};

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: Profile;
  memberships: MembershipWithOrg[];
  activeOrganisationId: string | null;
  activeRole: AppRole | null;
  isPlatformOwner: boolean;
};

export type DashboardCounts = {
  drivers: number;
  employees: number;
  vehicles: number;
  companies: number;
  sites: number;
  pickup_points: number;
  users: number;
};

export type GpsLastPosition = {
  organisation_id: string;
  driver_id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recorded_at: string;
  updated_at: string;
  drivers?: Pick<Driver, "id" | "full_name"> | null;
  vehicles?: Pick<Vehicle, "id" | "name" | "registration_number"> | null;
};

export type Geofence = {
  id: string;
  organisation_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  site_id: string | null;
  pickup_point_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type GeofenceEventType = "enter" | "exit";

export type GeofenceEvent = {
  id: string;
  organisation_id: string;
  geofence_id: string;
  driver_id: string;
  event_type: GeofenceEventType;
  latitude: number;
  longitude: number;
  recorded_at: string;
  created_at: string;
  geofences?: Pick<Geofence, "id" | "name"> | null;
  drivers?: Pick<Driver, "id" | "full_name"> | null;
};

export type GpsPointInput = {
  lat: number;
  lng: number;
  recorded_at?: string;
  accuracy_m?: number | null;
  vehicle_id?: string | null;
  trip_id?: string | null;
  driver_id?: string | null;
};

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ModuleEntitlement = {
  id: string;
  plan_id: string;
  module_key: string;
  created_at: string;
};

export type Subscription = {
  id: string;
  organisation_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

export type WhiteLabelConfig = {
  id: string;
  organisation_id: string;
  hostname: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  created_at: string;
  updated_at: string;
};
