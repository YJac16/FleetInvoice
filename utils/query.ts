export const queryKeys = {
  session: ["session"] as const,
  organisations: ["organisations"] as const,
  organisation: (id: string) => ["organisations", id] as const,
  members: (orgId: string) => ["members", orgId] as const,
  invitations: (orgId: string) => ["invitations", orgId] as const,
  drivers: (orgId: string) => ["drivers", orgId] as const,
  employees: (orgId: string) => ["employees", orgId] as const,
  vehicles: (orgId: string) => ["vehicles", orgId] as const,
  companies: (orgId: string) => ["companies", orgId] as const,
  areas: (orgId: string) => ["areas", orgId] as const,
  sites: (orgId: string) => ["sites", orgId] as const,
  pickupPoints: (orgId: string) => ["pickup-points", orgId] as const,
  vehicleDocuments: (orgId: string, vehicleId: string) =>
    ["vehicle-documents", orgId, vehicleId] as const,
  routes: (orgId: string) => ["routes", orgId] as const,
  routeStops: (orgId: string, routeId: string) =>
    ["route-stops", orgId, routeId] as const,
  schedules: (orgId: string) => ["schedules", orgId] as const,
  trips: (orgId: string) => ["trips", orgId] as const,
  driverTrips: (orgId: string) => ["driver-trips", orgId] as const,
  employeeTrips: (orgId: string) => ["employee-trips", orgId] as const,
  myTripPassengers: (orgId: string) => ["my-trip-passengers", orgId] as const,
  tripPassengers: (orgId: string, tripId: string) =>
    ["trip-passengers", orgId, tripId] as const,
  attendanceEvents: (orgId: string) => ["attendance-events", orgId] as const,
  myQrTokens: (orgId: string) => ["my-qr-tokens", orgId] as const,
  myEmployee: (orgId: string) => ["my-employee", orgId] as const,
  gpsLastPositions: (orgId: string) => ["gps-last-positions", orgId] as const,
  geofences: (orgId: string) => ["geofences", orgId] as const,
  geofenceEvents: (orgId: string) => ["geofence-events", orgId] as const,
  fuelFillups: (orgId: string) => ["fuel-fillups", orgId] as const,
  invoices: (orgId: string) => ["invoices", orgId] as const,
  invoiceLines: (orgId: string, invoiceId: string) =>
    ["invoice-lines", orgId, invoiceId] as const,
  rateCards: (orgId: string) => ["rate-cards", orgId] as const,
  payRates: (orgId: string) => ["pay-rates", orgId] as const,
  payrollRuns: (orgId: string) => ["payroll-runs", orgId] as const,
  payrollLines: (orgId: string, runId: string) =>
    ["payroll-lines", orgId, runId] as const,
  opsReport: (
    orgId: string,
    reportType: string,
    periodStart: string,
    periodEnd: string
  ) => ["ops-report", orgId, reportType, periodStart, periodEnd] as const,
  dashboard: (orgId: string) => ["dashboard", orgId] as const,
  profile: ["profile"] as const,
  plans: ["plans", "active"] as const,
  organisationSubscription: (orgId: string) =>
    ["subscription", orgId] as const,
  organisationVehiclesCount: (orgId: string) =>
    ["vehicles-count", orgId] as const,
};
