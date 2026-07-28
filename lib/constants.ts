export const APP_NAME = "WorkOps" as const;

export const APP_ROLES = [
  "platform_owner",
  "organisation_admin",
  "manager",
  "dispatcher",
  "supervisor",
  "company_manager",
  "driver",
  "employee",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const INVITABLE_ROLES = [
  "organisation_admin",
  "manager",
  "dispatcher",
  "supervisor",
  "company_manager",
  "driver",
  "employee",
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ENTITY_STATUSES = ["active", "inactive", "suspended"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ["active", "invited", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const VEHICLE_TYPES = [
  "sedan",
  "suv",
  "van",
  "minibus",
  "bus",
  "truck",
  "other",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  platform_owner: "Platform Owner",
  organisation_admin: "Organisation Admin",
  manager: "Manager",
  dispatcher: "Dispatcher",
  supervisor: "Supervisor",
  company_manager: "Company Manager",
  driver: "Driver",
  employee: "Employee",
};

export const STATUS_LABELS: Record<EntityStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sedan: "Sedan",
  suv: "SUV",
  van: "Van",
  minibus: "Minibus",
  bus: "Bus",
  truck: "Truck",
  other: "Other",
};

export const ORG_COOKIE_NAME = "workops_organisation_id";

export const VEHICLE_DOC_TYPES = [
  "license_disk",
  "insurance",
  "roadworthy",
  "other",
] as const;
export type VehicleDocType = (typeof VEHICLE_DOC_TYPES)[number];

export const VEHICLE_DOC_TYPE_LABELS: Record<VehicleDocType, string> = {
  license_disk: "License disk",
  insurance: "Insurance",
  roadworthy: "Roadworthy",
  other: "Other",
};

export const TRIP_STATUSES = [
  "planned",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planned: "Planned",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TRIP_EVENT_TYPES = [
  "assigned",
  "started",
  "arrived_stop",
  "completed",
  "cancelled",
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

export const TRIP_EVENT_TYPE_LABELS: Record<TripEventType, string> = {
  assigned: "Assigned",
  started: "Started",
  arrived_stop: "Arrived at stop",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const DAY_OF_WEEK_SHORT_LABELS: Record<DayOfWeek, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export const INVOICE_STATUSES = ["draft", "issued", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_LINE_TYPES = [
  "fuel",
  "trip",
  "fixed",
  "adjustment",
] as const;
export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number];

export const INVOICE_LINE_TYPE_LABELS: Record<InvoiceLineType, string> = {
  fuel: "Fuel",
  trip: "Trip",
  fixed: "Fixed",
  adjustment: "Adjustment",
};

export const RATE_CARD_UNITS = ["trip", "boarding", "fixed"] as const;
export type RateCardUnit = (typeof RATE_CARD_UNITS)[number];

export const RATE_CARD_UNIT_LABELS: Record<RateCardUnit, string> = {
  trip: "Per trip",
  boarding: "Per boarding",
  fixed: "Fixed fee",
};

export const RATE_CARD_LINE_TYPES = ["trip", "fixed", "adjustment"] as const;
export type RateCardLineType = (typeof RATE_CARD_LINE_TYPES)[number];

export const PAY_SUBJECT_ROLES = ["driver", "employee"] as const;
export type PaySubjectRole = (typeof PAY_SUBJECT_ROLES)[number];

export const PAY_SUBJECT_ROLE_LABELS: Record<PaySubjectRole, string> = {
  driver: "Driver",
  employee: "Employee",
};

export const PAY_RATE_UNITS = ["trip", "boarding", "fixed"] as const;
export type PayRateUnit = (typeof PAY_RATE_UNITS)[number];

export const PAY_RATE_UNIT_LABELS: Record<PayRateUnit, string> = {
  trip: "Per trip",
  boarding: "Per boarding",
  fixed: "Fixed fee",
};

export const PAYROLL_RUN_STATUSES = ["draft", "finalized", "void"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
  void: "Void",
};

export const PAYROLL_LINE_TYPES = [
  "trip",
  "boarding",
  "fixed",
  "adjustment",
] as const;
export type PayrollLineType = (typeof PAYROLL_LINE_TYPES)[number];

export const PAYROLL_LINE_TYPE_LABELS: Record<PayrollLineType, string> = {
  trip: "Trip",
  boarding: "Boarding",
  fixed: "Fixed",
  adjustment: "Adjustment",
};

export const ATTENDANCE_EVENT_TYPES = [
  "issued",
  "boarded",
  "confirmed",
  "rejected",
] as const;
export type AttendanceEventTypeConst =
  (typeof ATTENDANCE_EVENT_TYPES)[number];

export const ATTENDANCE_EVENT_TYPE_LABELS: Record<
  AttendanceEventTypeConst,
  string
> = {
  issued: "Issued",
  boarded: "Boarded",
  confirmed: "Confirmed",
  rejected: "Rejected",
};
