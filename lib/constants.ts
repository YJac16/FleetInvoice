/** Brand + product constants for FleetInvoice. */
export const APP_NAME = "FleetInvoice";
export const APP_DESCRIPTION =
  "Transport management for drivers who submit trips and offices that invoice them.";

export const ROUTES = {
  login: "/login",
  forgotPassword: "/forgot-password",
  dashboard: "/dashboard",
  trips: "/trips",
  drivers: "/drivers",
  companies: "/companies",
  vehicles: "/vehicles",
  areas: "/areas",
  pricingRules: "/pricing-rules",
  invoices: "/invoices",
  reports: "/reports",
  settings: "/settings",
} as const;

/** Admin-only path prefixes used by middleware for role redirects. */
export const ADMIN_ONLY_ROUTES = [
  ROUTES.drivers,
  ROUTES.companies,
  ROUTES.vehicles,
  ROUTES.areas,
  ROUTES.pricingRules,
  ROUTES.invoices,
  ROUTES.reports,
] as const;

export const AUTH_ROUTES = [ROUTES.login, ROUTES.forgotPassword] as const;

export const COOKIE_REMEMBER_ME = "fleetinvoice_remember_me";

export const BRAND = {
  primary: "#0F172A",
  accent: "#2563EB",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  background: "#FFFFFF",
} as const;
