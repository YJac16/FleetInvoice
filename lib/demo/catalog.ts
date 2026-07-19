import type { Area, Company, Vehicle } from "@/types/database";

export const DEMO_DRIVER_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_DRIVER_NAME = "Yaseen";
export const DEMO_ADMIN_USER_ID = "00000000-0000-0000-0000-0000000000aa";

export const DEMO_COMPANIES: Company[] = [
  {
    id: "c1111111-1111-1111-1111-111111111111",
    company_name: "Lewis Compliance",
    billing_address: null,
    contact_person: "Office Desk",
    phone: null,
    email: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "c2222222-2222-2222-2222-222222222222",
    company_name: "Lewis Head Office",
    billing_address: null,
    contact_person: "Dispatch",
    phone: null,
    email: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "c3333333-3333-3333-3333-333333333333",
    company_name: "Atlantic Transfers",
    billing_address: null,
    contact_person: null,
    phone: null,
    email: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_VEHICLES: Vehicle[] = [
  {
    id: "v1111111-1111-1111-1111-111111111111",
    registration: "CA 123-456",
    make: "Toyota",
    model: "Quantum",
    capacity: 14,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "v2222222-2222-2222-2222-222222222222",
    registration: "CA 987-654",
    make: "Mercedes",
    model: "Sprinter",
    capacity: 22,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_AREAS: Area[] = [
  "Town",
  "Woodstock",
  "Green Point",
  "Sea Point",
  "Airport",
  "Bellville",
  "Parow",
  "Milnerton",
  "Observatory",
  "Other",
].map((name, index) => ({
  id: `a0000000-0000-0000-0000-00000000000${index}`,
  name,
  zone: null,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));
