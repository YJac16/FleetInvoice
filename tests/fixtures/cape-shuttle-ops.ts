/**
 * Cape Shuttle Ops — screenshot / display demo fixtures.
 * IDs match database/seed.demo.cape-shuttle.sql
 */
import type {
  Area,
  Company,
  Driver,
  Employee,
  FuelFillup,
  Invoice,
  InvoiceLine,
  Organisation,
  PickupPoint,
  Route,
  RouteStop,
  Schedule,
  Site,
  Trip,
  TripAssignment,
  Vehicle,
} from "@/types";

const ORG_ID = "a1000000-0000-4000-8000-000000000001";
const ACM_ID = "a2000000-0000-4000-8000-000000000001";
const HBR_ID = "a2000000-0000-4000-8000-000000000002";

const TS = "2026-07-20T08:00:00.000Z";

export const DEMO_ORG_SLUG = "cape-shuttle-ops";
export const DEMO_ADMIN_EMAIL = "admin@cape-shuttle.example";

export const demoOrganisation = {
  id: ORG_ID,
  name: "Cape Shuttle Ops",
  slug: DEMO_ORG_SLUG,
  logo_url: null,
  settings: {},
  status: "active",
  created_by: null,
  created_at: TS,
  updated_at: TS,
  deleted_at: null,
} satisfies Organisation;

export const demoCompanies = [
  {
    id: ACM_ID,
    organisation_id: ORG_ID,
    name: "Acme Staffing",
    code: "ACM",
    contact_name: "Nomsa Dlamini",
    contact_email: "billing@acmestaffing.example",
    contact_phone: "+27 21 555 0101",
    address: "12 Long Street, Cape Town CBD, 8001",
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  },
  {
    id: HBR_ID,
    organisation_id: ORG_ID,
    name: "Harbor Logistics",
    code: "HBR",
    contact_name: "Pieter Botha",
    contact_email: "ops@harborlog.example",
    contact_phone: "+27 21 555 0202",
    address: "Dock Road, V&A Waterfront, 8002",
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  },
] satisfies Company[];

export const demoAreas = [
  { id: "a3000000-0000-4000-8000-000000000001", name: "Parklands", code: "PKL", description: "Northern suburbs staff pickups" },
  { id: "a3000000-0000-4000-8000-000000000002", name: "Milnerton", code: "MIL", description: "Blaauwberg corridor" },
  { id: "a3000000-0000-4000-8000-000000000003", name: "Woodstock", code: "WDS", description: "City fringe / industrial" },
  { id: "a3000000-0000-4000-8000-000000000004", name: "Kensington", code: "KEN", description: "Northern city bowl approach" },
  { id: "a3000000-0000-4000-8000-000000000005", name: "Dunoon", code: "DUN", description: "Northern residential pickups" },
  { id: "a3000000-0000-4000-8000-000000000006", name: "Hout Bay", code: "HTB", description: "Atlantic seaboard" },
  { id: "a3000000-0000-4000-8000-000000000007", name: "District Six", code: "DSX", description: "CBD east / heritage precinct" },
].map(
  (a): Area => ({
    ...a,
    organisation_id: ORG_ID,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoSites = [
  {
    id: "a4000000-0000-4000-8000-000000000001",
    company_id: ACM_ID,
    area_id: "a3000000-0000-4000-8000-000000000007",
    name: "Acme Foreshore Tower",
    code: "ACM-FSH",
    address: "1 Hertzog Boulevard, Foreshore, Cape Town, 8001",
    latitude: -33.9198,
    longitude: 18.4294,
  },
  {
    id: "a4000000-0000-4000-8000-000000000002",
    company_id: ACM_ID,
    area_id: "a3000000-0000-4000-8000-000000000002",
    name: "Acme Century City Hub",
    code: "ACM-CC",
    address: "Ratanga Road, Century City, 7441",
    latitude: -33.8912,
    longitude: 18.5118,
  },
  {
    id: "a4000000-0000-4000-8000-000000000003",
    company_id: HBR_ID,
    area_id: "a3000000-0000-4000-8000-000000000003",
    name: "Harbor Logistics Paarden Eiland Yard",
    code: "HBR-PE",
    address: "Marine Drive, Paarden Eiland, 7405",
    latitude: -33.9124,
    longitude: 18.4689,
  },
].map(
  (s): Site => ({
    ...s,
    organisation_id: ORG_ID,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoPickupPoints = [
  { id: "a5000000-0000-4000-8000-000000000001", area_id: "a3000000-0000-4000-8000-000000000001", site_id: null, name: "Parklands Circle", code: "PKL-01", address: "Parklands Main Road, Parklands", latitude: -33.8125, longitude: 18.4912 },
  { id: "a5000000-0000-4000-8000-000000000002", area_id: "a3000000-0000-4000-8000-000000000002", site_id: null, name: "Milnerton Racecourse Rd", code: "MIL-01", address: "Racecourse Road, Milnerton", latitude: -33.8688, longitude: 18.4965 },
  { id: "a5000000-0000-4000-8000-000000000003", area_id: "a3000000-0000-4000-8000-000000000003", site_id: "a4000000-0000-4000-8000-000000000003", name: "Woodstock Station", code: "WDS-01", address: "Albert Road, Woodstock", latitude: -33.9258, longitude: 18.4461 },
  { id: "a5000000-0000-4000-8000-000000000004", area_id: "a3000000-0000-4000-8000-000000000004", site_id: null, name: "Kensington Civic", code: "KEN-01", address: "11th Avenue, Kensington", latitude: -33.9102, longitude: 18.5058 },
  { id: "a5000000-0000-4000-8000-000000000005", area_id: "a3000000-0000-4000-8000-000000000005", site_id: null, name: "Dunoon Main Rd", code: "DUN-01", address: "Potsdam Road, Dunoon", latitude: -33.8261, longitude: 18.5419 },
  { id: "a5000000-0000-4000-8000-000000000006", area_id: "a3000000-0000-4000-8000-000000000006", site_id: null, name: "Hout Bay Harbour", code: "HTB-01", address: "Harbour Road, Hout Bay", latitude: -34.0489, longitude: 18.3478 },
  { id: "a5000000-0000-4000-8000-000000000007", area_id: "a3000000-0000-4000-8000-000000000007", site_id: "a4000000-0000-4000-8000-000000000001", name: "District Six Museum stop", code: "DSX-01", address: "Buitenkant Street, District Six", latitude: -33.9281, longitude: 18.4328 },
].map(
  (p): PickupPoint => ({
    ...p,
    organisation_id: ORG_ID,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoDrivers = [
  { id: "a6000000-0000-4000-8000-000000000001", full_name: "Thabo Nkosi", email: "thabo.nkosi@cape-shuttle.example", phone: "+27 82 555 1001", license_number: "CA-PDP-1001" },
  { id: "a6000000-0000-4000-8000-000000000002", full_name: "Ayesha Petersen", email: "ayesha.petersen@cape-shuttle.example", phone: "+27 82 555 1002", license_number: "CA-PDP-1002" },
  { id: "a6000000-0000-4000-8000-000000000003", full_name: "Johan van Wyk", email: "johan.vanwyk@cape-shuttle.example", phone: "+27 82 555 1003", license_number: "CA-PDP-1003" },
  { id: "a6000000-0000-4000-8000-000000000004", full_name: "Lindiwe Mokoena", email: "lindiwe.mokoena@cape-shuttle.example", phone: "+27 82 555 1004", license_number: "CA-PDP-1004" },
  { id: "a6000000-0000-4000-8000-000000000005", full_name: "Farouk Ismail", email: "farouk.ismail@cape-shuttle.example", phone: "+27 82 555 1005", license_number: "CA-PDP-1005" },
  { id: "a6000000-0000-4000-8000-000000000006", full_name: "Chantal September", email: "chantal.september@cape-shuttle.example", phone: "+27 82 555 1006", license_number: "CA-PDP-1006" },
].map(
  (d): Driver => ({
    ...d,
    organisation_id: ORG_ID,
    profile_id: null,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoEmployees = [
  { id: "a6100000-0000-4000-8000-000000000001", site_id: "a4000000-0000-4000-8000-000000000001", company_id: ACM_ID, full_name: "Sipho Mabena", email: "sipho.mabena@acmestaffing.example", phone: "+27 71 555 2001", employee_number: "ACM-1001" },
  { id: "a6100000-0000-4000-8000-000000000002", site_id: "a4000000-0000-4000-8000-000000000001", company_id: ACM_ID, full_name: "Fatima Abrahams", email: "fatima.abrahams@acmestaffing.example", phone: "+27 71 555 2002", employee_number: "ACM-1002" },
  { id: "a6100000-0000-4000-8000-000000000003", site_id: "a4000000-0000-4000-8000-000000000001", company_id: ACM_ID, full_name: "Craig October", email: "craig.october@acmestaffing.example", phone: "+27 71 555 2003", employee_number: "ACM-1003" },
  { id: "a6100000-0000-4000-8000-000000000004", site_id: "a4000000-0000-4000-8000-000000000002", company_id: ACM_ID, full_name: "Naledi Khumalo", email: "naledi.khumalo@acmestaffing.example", phone: "+27 71 555 2004", employee_number: "ACM-1004" },
  { id: "a6100000-0000-4000-8000-000000000005", site_id: "a4000000-0000-4000-8000-000000000002", company_id: ACM_ID, full_name: "Devon Jacobs", email: "devon.jacobs@acmestaffing.example", phone: "+27 71 555 2005", employee_number: "ACM-1005" },
  { id: "a6100000-0000-4000-8000-000000000006", site_id: "a4000000-0000-4000-8000-000000000002", company_id: ACM_ID, full_name: "Zanele Dube", email: "zanele.dube@acmestaffing.example", phone: "+27 71 555 2006", employee_number: "ACM-1006" },
  { id: "a6100000-0000-4000-8000-000000000007", site_id: "a4000000-0000-4000-8000-000000000001", company_id: ACM_ID, full_name: "Ryan Cupido", email: "ryan.cupido@acmestaffing.example", phone: "+27 71 555 2007", employee_number: "ACM-1007" },
  { id: "a6100000-0000-4000-8000-000000000008", site_id: "a4000000-0000-4000-8000-000000000001", company_id: ACM_ID, full_name: "Thandiwe Sithole", email: "thandiwe.sithole@acmestaffing.example", phone: "+27 71 555 2008", employee_number: "ACM-1008" },
  { id: "a6100000-0000-4000-8000-000000000009", site_id: "a4000000-0000-4000-8000-000000000002", company_id: ACM_ID, full_name: "Mark Solomons", email: "mark.solomons@acmestaffing.example", phone: "+27 71 555 2009", employee_number: "ACM-1009" },
  { id: "a6100000-0000-4000-8000-000000000010", site_id: "a4000000-0000-4000-8000-000000000001", company_id: ACM_ID, full_name: "Leah Naidoo", email: "leah.naidoo@acmestaffing.example", phone: "+27 71 555 2010", employee_number: "ACM-1010" },
  { id: "a6100000-0000-4000-8000-000000000011", site_id: "a4000000-0000-4000-8000-000000000002", company_id: ACM_ID, full_name: "Bongani Molefe", email: "bongani.molefe@acmestaffing.example", phone: "+27 71 555 2011", employee_number: "ACM-1011" },
  { id: "a6100000-0000-4000-8000-000000000012", site_id: "a4000000-0000-4000-8000-000000000003", company_id: HBR_ID, full_name: "Wendy Fortuin", email: "wendy.fortuin@harborlog.example", phone: "+27 71 555 2012", employee_number: "HBR-2001" },
].map(
  (e): Employee => ({
    ...e,
    organisation_id: ORG_ID,
    profile_id: null,
    home_address: null,
    home_latitude: null,
    home_longitude: null,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoVehicles = [
  { id: "a7000000-0000-4000-8000-000000000001", company_id: ACM_ID, name: "Quantam 1", registration_number: "CA 123-456", vehicle_type: "minibus" as const, capacity: 16 },
  { id: "a7000000-0000-4000-8000-000000000002", company_id: ACM_ID, name: "Quantam 2", registration_number: "CA 789-012", vehicle_type: "minibus" as const, capacity: 16 },
  { id: "a7000000-0000-4000-8000-000000000003", company_id: ACM_ID, name: "Quantam 3", registration_number: "CY 234-567", vehicle_type: "minibus" as const, capacity: 14 },
  { id: "a7000000-0000-4000-8000-000000000004", company_id: ACM_ID, name: "Ertiga 1", registration_number: "CA 345-678", vehicle_type: "van" as const, capacity: 7 },
  { id: "a7000000-0000-4000-8000-000000000005", company_id: HBR_ID, name: "Ertiga 2", registration_number: "CY 901-234", vehicle_type: "van" as const, capacity: 7 },
].map(
  (v): Vehicle => ({
    ...v,
    organisation_id: ORG_ID,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoRoutes = [
  {
    id: "a8000000-0000-4000-8000-000000000001",
    company_id: ACM_ID,
    area_id: "a3000000-0000-4000-8000-000000000001",
    name: "Northern Corridor Staff Run",
    code: "STAFF-N",
    description: "Parklands → Milnerton → Dunoon → Acme Century City Hub",
  },
  {
    id: "a8000000-0000-4000-8000-000000000002",
    company_id: ACM_ID,
    area_id: "a3000000-0000-4000-8000-000000000004",
    name: "City Bowl Staff Run",
    code: "STAFF-C",
    description: "Kensington → Woodstock → District Six → Acme Foreshore Tower",
  },
  {
    id: "a8000000-0000-4000-8000-000000000003",
    company_id: ACM_ID,
    area_id: "a3000000-0000-4000-8000-000000000006",
    name: "Atlantic Staff Run",
    code: "STAFF-A",
    description: "Hout Bay Harbour → Acme Foreshore Tower",
  },
].map(
  (r): Route => ({
    ...r,
    organisation_id: ORG_ID,
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoRouteStops = [
  { id: "a8100000-0000-4000-8000-000000000001", route_id: "a8000000-0000-4000-8000-000000000001", sequence: 1, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000001", label: "Parklands Circle", dwell_minutes: 3 },
  { id: "a8100000-0000-4000-8000-000000000002", route_id: "a8000000-0000-4000-8000-000000000001", sequence: 2, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000002", label: "Milnerton Racecourse Rd", dwell_minutes: 3 },
  { id: "a8100000-0000-4000-8000-000000000003", route_id: "a8000000-0000-4000-8000-000000000001", sequence: 3, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000005", label: "Dunoon Main Rd", dwell_minutes: 3 },
  { id: "a8100000-0000-4000-8000-000000000004", route_id: "a8000000-0000-4000-8000-000000000001", sequence: 4, site_id: "a4000000-0000-4000-8000-000000000002", pickup_point_id: null, label: "Acme Century City Hub", dwell_minutes: 5 },
  { id: "a8100000-0000-4000-8000-000000000005", route_id: "a8000000-0000-4000-8000-000000000002", sequence: 1, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000004", label: "Kensington Civic", dwell_minutes: 3 },
  { id: "a8100000-0000-4000-8000-000000000006", route_id: "a8000000-0000-4000-8000-000000000002", sequence: 2, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000003", label: "Woodstock Station", dwell_minutes: 3 },
  { id: "a8100000-0000-4000-8000-000000000007", route_id: "a8000000-0000-4000-8000-000000000002", sequence: 3, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000007", label: "District Six Museum stop", dwell_minutes: 2 },
  { id: "a8100000-0000-4000-8000-000000000008", route_id: "a8000000-0000-4000-8000-000000000002", sequence: 4, site_id: "a4000000-0000-4000-8000-000000000001", pickup_point_id: null, label: "Acme Foreshore Tower", dwell_minutes: 5 },
  { id: "a8100000-0000-4000-8000-000000000009", route_id: "a8000000-0000-4000-8000-000000000003", sequence: 1, site_id: null, pickup_point_id: "a5000000-0000-4000-8000-000000000006", label: "Hout Bay Harbour", dwell_minutes: 4 },
  { id: "a8100000-0000-4000-8000-000000000010", route_id: "a8000000-0000-4000-8000-000000000003", sequence: 2, site_id: "a4000000-0000-4000-8000-000000000001", pickup_point_id: null, label: "Acme Foreshore Tower", dwell_minutes: 5 },
].map(
  (s): RouteStop => ({
    ...s,
    organisation_id: ORG_ID,
    notes: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoSchedules = [
  { id: "a8000000-0000-4000-8000-000000000011", route_id: "a8000000-0000-4000-8000-000000000001", name: "Weekday 06:15 North", depart_time: "06:15:00" },
  { id: "a8000000-0000-4000-8000-000000000012", route_id: "a8000000-0000-4000-8000-000000000002", name: "Weekday 06:30 City", depart_time: "06:30:00" },
  { id: "a8000000-0000-4000-8000-000000000013", route_id: "a8000000-0000-4000-8000-000000000003", name: "Weekday 06:00 Atlantic", depart_time: "06:00:00" },
].map(
  (s): Schedule => ({
    ...s,
    organisation_id: ORG_ID,
    days_of_week: [1, 2, 3, 4, 5],
    effective_from: "2026-07-13",
    effective_to: null,
    timezone: "Africa/Johannesburg",
    status: "active",
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoTrips = [
  { id: "a9000000-0000-4000-8000-000000000001", route_id: "a8000000-0000-4000-8000-000000000001", schedule_id: "a8000000-0000-4000-8000-000000000011", planned_start: "2026-07-13T04:15:00.000Z", planned_end: "2026-07-13T05:30:00.000Z", status: "completed" as const },
  { id: "a9000000-0000-4000-8000-000000000002", route_id: "a8000000-0000-4000-8000-000000000001", schedule_id: "a8000000-0000-4000-8000-000000000011", planned_start: "2026-07-15T04:15:00.000Z", planned_end: "2026-07-15T05:30:00.000Z", status: "completed" as const },
  { id: "a9000000-0000-4000-8000-000000000003", route_id: "a8000000-0000-4000-8000-000000000002", schedule_id: "a8000000-0000-4000-8000-000000000012", planned_start: "2026-07-13T04:30:00.000Z", planned_end: "2026-07-13T05:30:00.000Z", status: "completed" as const },
  { id: "a9000000-0000-4000-8000-000000000004", route_id: "a8000000-0000-4000-8000-000000000002", schedule_id: "a8000000-0000-4000-8000-000000000012", planned_start: "2026-07-15T04:30:00.000Z", planned_end: "2026-07-15T05:30:00.000Z", status: "assigned" as const },
  { id: "a9000000-0000-4000-8000-000000000005", route_id: "a8000000-0000-4000-8000-000000000003", schedule_id: "a8000000-0000-4000-8000-000000000013", planned_start: "2026-07-13T04:00:00.000Z", planned_end: "2026-07-13T05:30:00.000Z", status: "completed" as const },
  { id: "a9000000-0000-4000-8000-000000000006", route_id: "a8000000-0000-4000-8000-000000000001", schedule_id: "a8000000-0000-4000-8000-000000000011", planned_start: "2026-07-20T04:15:00.000Z", planned_end: "2026-07-20T05:30:00.000Z", status: "planned" as const },
].map(
  (t): Trip => ({
    ...t,
    organisation_id: ORG_ID,
    company_id: ACM_ID,
    generation_key: null,
    notes: null,
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoTripAssignments = [
  { id: "aa000000-0000-4000-8000-000000000001", trip_id: "a9000000-0000-4000-8000-000000000001", driver_id: "a6000000-0000-4000-8000-000000000001", vehicle_id: "a7000000-0000-4000-8000-000000000001" },
  { id: "aa000000-0000-4000-8000-000000000002", trip_id: "a9000000-0000-4000-8000-000000000002", driver_id: "a6000000-0000-4000-8000-000000000005", vehicle_id: "a7000000-0000-4000-8000-000000000001" },
  { id: "aa000000-0000-4000-8000-000000000003", trip_id: "a9000000-0000-4000-8000-000000000003", driver_id: "a6000000-0000-4000-8000-000000000002", vehicle_id: "a7000000-0000-4000-8000-000000000002" },
  { id: "aa000000-0000-4000-8000-000000000004", trip_id: "a9000000-0000-4000-8000-000000000004", driver_id: "a6000000-0000-4000-8000-000000000003", vehicle_id: "a7000000-0000-4000-8000-000000000004" },
  { id: "aa000000-0000-4000-8000-000000000005", trip_id: "a9000000-0000-4000-8000-000000000005", driver_id: "a6000000-0000-4000-8000-000000000004", vehicle_id: "a7000000-0000-4000-8000-000000000003" },
].map(
  (a): TripAssignment => ({
    ...a,
    organisation_id: ORG_ID,
    assigned_by: null,
    assigned_at: TS,
    released_at: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoFuelFillups = [
  { id: "ab000000-0000-4000-8000-000000000001", vehicle_id: "a7000000-0000-4000-8000-000000000001", driver_id: "a6000000-0000-4000-8000-000000000001", odometer_km: 84210, litres: 55, unit_price: 23.45, total_amount: 1289.75, station_name: "Engen Milnerton" },
  { id: "ab000000-0000-4000-8000-000000000002", vehicle_id: "a7000000-0000-4000-8000-000000000002", driver_id: "a6000000-0000-4000-8000-000000000002", odometer_km: 76102, litres: 48.5, unit_price: 23.45, total_amount: 1137.33, station_name: "Shell Woodstock" },
  { id: "ab000000-0000-4000-8000-000000000003", vehicle_id: "a7000000-0000-4000-8000-000000000004", driver_id: "a6000000-0000-4000-8000-000000000003", odometer_km: 51240, litres: 32, unit_price: 23.89, total_amount: 764.48, station_name: "Caltex Kensington" },
  { id: "ab000000-0000-4000-8000-000000000004", vehicle_id: "a7000000-0000-4000-8000-000000000003", driver_id: "a6000000-0000-4000-8000-000000000006", odometer_km: 69880, litres: 52, unit_price: 23.45, total_amount: 1219.4, station_name: "Engen Hout Bay" },
].map(
  (f): FuelFillup => ({
    ...f,
    organisation_id: ORG_ID,
    company_id: ACM_ID,
    filled_at: TS,
    currency: "ZAR",
    notes: null,
    created_by: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
  }),
);

export const demoInvoice = {
  id: "ac000000-0000-4000-8000-000000000001",
  organisation_id: ORG_ID,
  company_id: ACM_ID,
  period_start: "2026-07-13",
  period_end: "2026-07-19",
  status: "issued",
  currency: "ZAR",
  subtotal: 4410.96,
  total: 4410.96,
  notes: "Weekly staff transport fuel recovery — Cape Shuttle Ops",
  generated_by: null,
  issued_at: "2026-07-19T07:00:00.000Z",
  paid_at: null,
  created_at: TS,
  updated_at: TS,
  deleted_at: null,
} satisfies Invoice;

export const demoInvoiceLines = [
  { id: "ac000000-0000-4000-8000-000000000011", fuel_fillup_id: "ab000000-0000-4000-8000-000000000001", description: "Fuel — Quantam 1 (Engen Milnerton)", quantity: 55, unit_price: 23.45, amount: 1289.75 },
  { id: "ac000000-0000-4000-8000-000000000012", fuel_fillup_id: "ab000000-0000-4000-8000-000000000002", description: "Fuel — Quantam 2 (Shell Woodstock)", quantity: 48.5, unit_price: 23.45, amount: 1137.33 },
  { id: "ac000000-0000-4000-8000-000000000013", fuel_fillup_id: "ab000000-0000-4000-8000-000000000003", description: "Fuel — Ertiga 1 (Caltex Kensington)", quantity: 32, unit_price: 23.89, amount: 764.48 },
  { id: "ac000000-0000-4000-8000-000000000014", fuel_fillup_id: "ab000000-0000-4000-8000-000000000004", description: "Fuel — Quantam 3 (Engen Hout Bay)", quantity: 52, unit_price: 23.45, amount: 1219.4 },
].map(
  (l): InvoiceLine => ({
    ...l,
    organisation_id: ORG_ID,
    invoice_id: demoInvoice.id,
    line_type: "fuel",
    rate_card_id: null,
    trip_id: null,
    created_at: TS,
  }),
);

/** Convenient bundle for Storybook / screenshot helpers */
export const capeShuttleDemo = {
  organisation: demoOrganisation,
  companies: demoCompanies,
  areas: demoAreas,
  sites: demoSites,
  pickupPoints: demoPickupPoints,
  drivers: demoDrivers,
  employees: demoEmployees,
  vehicles: demoVehicles,
  routes: demoRoutes,
  routeStops: demoRouteStops,
  schedules: demoSchedules,
  trips: demoTrips,
  tripAssignments: demoTripAssignments,
  fuelFillups: demoFuelFillups,
  invoice: demoInvoice,
  invoiceLines: demoInvoiceLines,
} as const;
