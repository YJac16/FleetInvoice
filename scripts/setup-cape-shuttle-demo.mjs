/**
 * One-shot: create Cape Shuttle Ops demo auth user + seed master/ops data.
 * Usage: node scripts/setup-cape-shuttle-demo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const DEMO_EMAIL = "admin@cape-shuttle.example";
const DEMO_PASSWORD = "CapeShuttle2026!";
const DEMO_NAME = "Cape Shuttle Admin";

const IDS = {
  org: "a1000000-0000-4000-8000-000000000001",
  memberDemo: "a1000000-0000-4000-8000-000000000002",
  memberYaseen: "a1000000-0000-4000-8000-000000000003",
  acm: "a2000000-0000-4000-8000-000000000001",
  hbr: "a2000000-0000-4000-8000-000000000002",
  areas: {
    parklands: "a3000000-0000-4000-8000-000000000001",
    milnerton: "a3000000-0000-4000-8000-000000000002",
    woodstock: "a3000000-0000-4000-8000-000000000003",
    kensington: "a3000000-0000-4000-8000-000000000004",
    dunoon: "a3000000-0000-4000-8000-000000000005",
    houtbay: "a3000000-0000-4000-8000-000000000006",
    district6: "a3000000-0000-4000-8000-000000000007",
  },
  sites: {
    foreshore: "a4000000-0000-4000-8000-000000000001",
    century: "a4000000-0000-4000-8000-000000000002",
    paarden: "a4000000-0000-4000-8000-000000000003",
  },
  pickups: {
    parklands: "a5000000-0000-4000-8000-000000000001",
    milnerton: "a5000000-0000-4000-8000-000000000002",
    woodstock: "a5000000-0000-4000-8000-000000000003",
    kensington: "a5000000-0000-4000-8000-000000000004",
    dunoon: "a5000000-0000-4000-8000-000000000005",
    houtbay: "a5000000-0000-4000-8000-000000000006",
    district6: "a5000000-0000-4000-8000-000000000007",
  },
  drivers: {
    thabo: "a6000000-0000-4000-8000-000000000001",
    ayesha: "a6000000-0000-4000-8000-000000000002",
    johan: "a6000000-0000-4000-8000-000000000003",
    lindiwe: "a6000000-0000-4000-8000-000000000004",
    farouk: "a6000000-0000-4000-8000-000000000005",
    chantal: "a6000000-0000-4000-8000-000000000006",
  },
  vehicles: {
    q1: "a7000000-0000-4000-8000-000000000001",
    q2: "a7000000-0000-4000-8000-000000000002",
    q3: "a7000000-0000-4000-8000-000000000003",
    e1: "a7000000-0000-4000-8000-000000000004",
    e2: "a7000000-0000-4000-8000-000000000005",
  },
  routes: {
    north: "a8000000-0000-4000-8000-000000000001",
    city: "a8000000-0000-4000-8000-000000000002",
    atlantic: "a8000000-0000-4000-8000-000000000003",
  },
  schedules: {
    north: "a8000000-0000-4000-8000-000000000011",
    city: "a8000000-0000-4000-8000-000000000012",
    atlantic: "a8000000-0000-4000-8000-000000000013",
  },
  trips: {
    n1: "a9000000-0000-4000-8000-000000000001",
    n2: "a9000000-0000-4000-8000-000000000002",
    c1: "a9000000-0000-4000-8000-000000000003",
    c2: "a9000000-0000-4000-8000-000000000004",
    a1: "a9000000-0000-4000-8000-000000000005",
    a2: "a9000000-0000-4000-8000-000000000006",
  },
  fuel: {
    f1: "ab000000-0000-4000-8000-000000000001",
    f2: "ab000000-0000-4000-8000-000000000002",
    f3: "ab000000-0000-4000-8000-000000000003",
    f4: "ab000000-0000-4000-8000-000000000004",
  },
  invoice: "ac000000-0000-4000-8000-000000000001",
};

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env.local"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

function mondayOfWeek(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Cape Town local wall time → ISO timestamptz string */
function ctIso(dateYmd, hhmmss) {
  // Africa/Johannesburg is UTC+2 year-round
  return new Date(`${dateYmd}T${hhmmss}+02:00`).toISOString();
}

function must(label, { error }) {
  if (error) {
    console.error(`FAIL ${label}:`, error.message);
    process.exit(1);
  }
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingOrg } = await sb
    .from("organisations")
    .select("id")
    .eq("slug", "cape-shuttle-ops")
    .is("deleted_at", null)
    .maybeSingle();

  if (existingOrg) {
    console.log("Demo org already exists — ensuring memberships / credentials only.");
  }

  // --- Auth user ---
  let demoUserId;
  const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) throw listed.error;
  const found = listed.data.users.find(
    (u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase(),
  );

  if (found) {
    demoUserId = found.id;
    const upd = await sb.auth.admin.updateUserById(demoUserId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: DEMO_NAME },
    });
    if (upd.error) throw upd.error;
    console.log("Updated password for existing demo user.");
  } else {
    const created = await sb.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: DEMO_NAME },
    });
    if (created.error) throw created.error;
    demoUserId = created.data.user.id;
    console.log("Created demo auth user.");
  }

  // Ensure profile
  await sb.from("profiles").upsert({
    id: demoUserId,
    email: DEMO_EMAIL,
    full_name: DEMO_NAME,
  });

  const { data: yaseen } = await sb
    .from("profiles")
    .select("id, email")
    .eq("email", "yaseenjacobs97@gmail.com")
    .maybeSingle();

  if (existingOrg) {
    // still attach memberships
    must(
      "member demo",
      await sb.from("organisation_members").upsert({
        id: IDS.memberDemo,
        organisation_id: IDS.org,
        user_id: demoUserId,
        role: "organisation_admin",
        status: "active",
        created_by: demoUserId,
      }),
    );
    if (yaseen) {
      must(
        "member yaseen",
        await sb.from("organisation_members").upsert({
          id: IDS.memberYaseen,
          organisation_id: IDS.org,
          user_id: yaseen.id,
          role: "organisation_admin",
          status: "active",
          created_by: demoUserId,
        }),
      );
    }
    printCreds();
    return;
  }

  const weekMon = mondayOfWeek(new Date());
  const periodStart = addDays(weekMon, -7);
  const periodEnd = addDays(weekMon, -1);
  const ps = ymd(periodStart);
  const pe = ymd(periodEnd);
  const wm = ymd(weekMon);

  must(
    "org",
    await sb.from("organisations").insert({
      id: IDS.org,
      name: "Cape Shuttle Ops",
      slug: "cape-shuttle-ops",
      status: "active",
      created_by: demoUserId,
    }),
  );

  must(
    "member demo",
    await sb.from("organisation_members").insert({
      id: IDS.memberDemo,
      organisation_id: IDS.org,
      user_id: demoUserId,
      role: "organisation_admin",
      status: "active",
      created_by: demoUserId,
    }),
  );

  if (yaseen) {
    must(
      "member yaseen",
      await sb.from("organisation_members").insert({
        id: IDS.memberYaseen,
        organisation_id: IDS.org,
        user_id: yaseen.id,
        role: "organisation_admin",
        status: "active",
        created_by: demoUserId,
      }),
    );
  }

  must(
    "companies",
    await sb.from("companies").insert([
      {
        id: IDS.acm,
        organisation_id: IDS.org,
        name: "Acme Staffing",
        code: "ACM",
        contact_name: "Nomsa Dlamini",
        contact_email: "billing@acmestaffing.example",
        contact_phone: "+27 21 555 0101",
        address: "12 Long Street, Cape Town CBD, 8001",
        status: "active",
        created_by: demoUserId,
      },
      {
        id: IDS.hbr,
        organisation_id: IDS.org,
        name: "Harbor Logistics",
        code: "HBR",
        contact_name: "Pieter Botha",
        contact_email: "ops@harborlog.example",
        contact_phone: "+27 21 555 0202",
        address: "Dock Road, V&A Waterfront, 8002",
        status: "active",
        created_by: demoUserId,
      },
    ]),
  );

  must(
    "areas",
    await sb.from("areas").insert([
      { id: IDS.areas.parklands, organisation_id: IDS.org, name: "Parklands", code: "PKL", description: "Northern suburbs staff pickups", status: "active", created_by: demoUserId },
      { id: IDS.areas.milnerton, organisation_id: IDS.org, name: "Milnerton", code: "MIL", description: "Blaauwberg corridor", status: "active", created_by: demoUserId },
      { id: IDS.areas.woodstock, organisation_id: IDS.org, name: "Woodstock", code: "WDS", description: "City fringe / industrial", status: "active", created_by: demoUserId },
      { id: IDS.areas.kensington, organisation_id: IDS.org, name: "Kensington", code: "KEN", description: "Northern city bowl approach", status: "active", created_by: demoUserId },
      { id: IDS.areas.dunoon, organisation_id: IDS.org, name: "Dunoon", code: "DUN", description: "Northern residential pickups", status: "active", created_by: demoUserId },
      { id: IDS.areas.houtbay, organisation_id: IDS.org, name: "Hout Bay", code: "HTB", description: "Atlantic seaboard", status: "active", created_by: demoUserId },
      { id: IDS.areas.district6, organisation_id: IDS.org, name: "District Six", code: "DSX", description: "CBD east / heritage precinct", status: "active", created_by: demoUserId },
    ]),
  );

  must(
    "sites",
    await sb.from("sites").insert([
      {
        id: IDS.sites.foreshore,
        organisation_id: IDS.org,
        company_id: IDS.acm,
        area_id: IDS.areas.district6,
        name: "Acme Foreshore Tower",
        code: "ACM-FSH",
        address: "1 Hertzog Boulevard, Foreshore, Cape Town, 8001",
        latitude: -33.9198,
        longitude: 18.4294,
        status: "active",
        created_by: demoUserId,
      },
      {
        id: IDS.sites.century,
        organisation_id: IDS.org,
        company_id: IDS.acm,
        area_id: IDS.areas.milnerton,
        name: "Acme Century City Hub",
        code: "ACM-CC",
        address: "Ratanga Road, Century City, 7441",
        latitude: -33.8912,
        longitude: 18.5118,
        status: "active",
        created_by: demoUserId,
      },
      {
        id: IDS.sites.paarden,
        organisation_id: IDS.org,
        company_id: IDS.hbr,
        area_id: IDS.areas.woodstock,
        name: "Harbor Logistics Paarden Eiland Yard",
        code: "HBR-PE",
        address: "Marine Drive, Paarden Eiland, 7405",
        latitude: -33.9124,
        longitude: 18.4689,
        status: "active",
        created_by: demoUserId,
      },
    ]),
  );

  must(
    "pickup_points",
    await sb.from("pickup_points").insert([
      { id: IDS.pickups.parklands, organisation_id: IDS.org, area_id: IDS.areas.parklands, name: "Parklands Circle", code: "PKL-01", address: "Parklands Main Road, Parklands", latitude: -33.8125, longitude: 18.4912, status: "active", created_by: demoUserId },
      { id: IDS.pickups.milnerton, organisation_id: IDS.org, area_id: IDS.areas.milnerton, name: "Milnerton Racecourse Rd", code: "MIL-01", address: "Racecourse Road, Milnerton", latitude: -33.8688, longitude: 18.4965, status: "active", created_by: demoUserId },
      { id: IDS.pickups.woodstock, organisation_id: IDS.org, site_id: IDS.sites.paarden, area_id: IDS.areas.woodstock, name: "Woodstock Station", code: "WDS-01", address: "Albert Road, Woodstock", latitude: -33.9258, longitude: 18.4461, status: "active", created_by: demoUserId },
      { id: IDS.pickups.kensington, organisation_id: IDS.org, area_id: IDS.areas.kensington, name: "Kensington Civic", code: "KEN-01", address: "11th Avenue, Kensington", latitude: -33.9102, longitude: 18.5058, status: "active", created_by: demoUserId },
      { id: IDS.pickups.dunoon, organisation_id: IDS.org, area_id: IDS.areas.dunoon, name: "Dunoon Main Rd", code: "DUN-01", address: "Potsdam Road, Dunoon", latitude: -33.8261, longitude: 18.5419, status: "active", created_by: demoUserId },
      { id: IDS.pickups.houtbay, organisation_id: IDS.org, area_id: IDS.areas.houtbay, name: "Hout Bay Harbour", code: "HTB-01", address: "Harbour Road, Hout Bay", latitude: -34.0489, longitude: 18.3478, status: "active", created_by: demoUserId },
      { id: IDS.pickups.district6, organisation_id: IDS.org, site_id: IDS.sites.foreshore, area_id: IDS.areas.district6, name: "District Six Museum stop", code: "DSX-01", address: "Buitenkant Street, District Six", latitude: -33.9281, longitude: 18.4328, status: "active", created_by: demoUserId },
    ]),
  );

  must(
    "drivers",
    await sb.from("drivers").insert([
      { id: IDS.drivers.thabo, organisation_id: IDS.org, full_name: "Thabo Nkosi", email: "thabo.nkosi@cape-shuttle.example", phone: "+27 82 555 1001", license_number: "CA-PDP-1001", status: "active", created_by: demoUserId },
      { id: IDS.drivers.ayesha, organisation_id: IDS.org, full_name: "Ayesha Petersen", email: "ayesha.petersen@cape-shuttle.example", phone: "+27 82 555 1002", license_number: "CA-PDP-1002", status: "active", created_by: demoUserId },
      { id: IDS.drivers.johan, organisation_id: IDS.org, full_name: "Johan van Wyk", email: "johan.vanwyk@cape-shuttle.example", phone: "+27 82 555 1003", license_number: "CA-PDP-1003", status: "active", created_by: demoUserId },
      { id: IDS.drivers.lindiwe, organisation_id: IDS.org, full_name: "Lindiwe Mokoena", email: "lindiwe.mokoena@cape-shuttle.example", phone: "+27 82 555 1004", license_number: "CA-PDP-1004", status: "active", created_by: demoUserId },
      { id: IDS.drivers.farouk, organisation_id: IDS.org, full_name: "Farouk Ismail", email: "farouk.ismail@cape-shuttle.example", phone: "+27 82 555 1005", license_number: "CA-PDP-1005", status: "active", created_by: demoUserId },
      { id: IDS.drivers.chantal, organisation_id: IDS.org, full_name: "Chantal September", email: "chantal.september@cape-shuttle.example", phone: "+27 82 555 1006", license_number: "CA-PDP-1006", status: "active", created_by: demoUserId },
    ]),
  );

  must(
    "employees",
    await sb.from("employees").insert([
      { id: "a6100000-0000-4000-8000-000000000001", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.foreshore, full_name: "Sipho Mabena", email: "sipho.mabena@acmestaffing.example", phone: "+27 71 555 2001", employee_number: "ACM-1001", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000002", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.foreshore, full_name: "Fatima Abrahams", email: "fatima.abrahams@acmestaffing.example", phone: "+27 71 555 2002", employee_number: "ACM-1002", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000003", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.foreshore, full_name: "Craig October", email: "craig.october@acmestaffing.example", phone: "+27 71 555 2003", employee_number: "ACM-1003", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000004", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.century, full_name: "Naledi Khumalo", email: "naledi.khumalo@acmestaffing.example", phone: "+27 71 555 2004", employee_number: "ACM-1004", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000005", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.century, full_name: "Devon Jacobs", email: "devon.jacobs@acmestaffing.example", phone: "+27 71 555 2005", employee_number: "ACM-1005", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000006", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.century, full_name: "Zanele Dube", email: "zanele.dube@acmestaffing.example", phone: "+27 71 555 2006", employee_number: "ACM-1006", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000007", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.foreshore, full_name: "Ryan Cupido", email: "ryan.cupido@acmestaffing.example", phone: "+27 71 555 2007", employee_number: "ACM-1007", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000008", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.foreshore, full_name: "Thandiwe Sithole", email: "thandiwe.sithole@acmestaffing.example", phone: "+27 71 555 2008", employee_number: "ACM-1008", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000009", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.century, full_name: "Mark Solomons", email: "mark.solomons@acmestaffing.example", phone: "+27 71 555 2009", employee_number: "ACM-1009", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000010", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.foreshore, full_name: "Leah Naidoo", email: "leah.naidoo@acmestaffing.example", phone: "+27 71 555 2010", employee_number: "ACM-1010", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000011", organisation_id: IDS.org, company_id: IDS.acm, site_id: IDS.sites.century, full_name: "Bongani Molefe", email: "bongani.molefe@acmestaffing.example", phone: "+27 71 555 2011", employee_number: "ACM-1011", status: "active", created_by: demoUserId },
      { id: "a6100000-0000-4000-8000-000000000012", organisation_id: IDS.org, company_id: IDS.hbr, site_id: IDS.sites.paarden, full_name: "Wendy Fortuin", email: "wendy.fortuin@harborlog.example", phone: "+27 71 555 2012", employee_number: "HBR-2001", status: "active", created_by: demoUserId },
    ]),
  );

  must(
    "vehicles",
    await sb.from("vehicles").insert([
      { id: IDS.vehicles.q1, organisation_id: IDS.org, company_id: IDS.acm, name: "Quantam 1", registration_number: "CA 123-456", vehicle_type: "minibus", capacity: 16, status: "active", created_by: demoUserId },
      { id: IDS.vehicles.q2, organisation_id: IDS.org, company_id: IDS.acm, name: "Quantam 2", registration_number: "CA 789-012", vehicle_type: "minibus", capacity: 16, status: "active", created_by: demoUserId },
      { id: IDS.vehicles.q3, organisation_id: IDS.org, company_id: IDS.acm, name: "Quantam 3", registration_number: "CY 234-567", vehicle_type: "minibus", capacity: 14, status: "active", created_by: demoUserId },
      { id: IDS.vehicles.e1, organisation_id: IDS.org, company_id: IDS.acm, name: "Ertiga 1", registration_number: "CA 345-678", vehicle_type: "van", capacity: 7, status: "active", created_by: demoUserId },
      { id: IDS.vehicles.e2, organisation_id: IDS.org, company_id: IDS.hbr, name: "Ertiga 2", registration_number: "CY 901-234", vehicle_type: "van", capacity: 7, status: "active", created_by: demoUserId },
    ]),
  );

  must(
    "routes",
    await sb.from("routes").insert([
      { id: IDS.routes.north, organisation_id: IDS.org, company_id: IDS.acm, area_id: IDS.areas.parklands, name: "Northern Corridor Staff Run", code: "STAFF-N", description: "Parklands → Milnerton → Dunoon → Acme Century City Hub", status: "active", created_by: demoUserId },
      { id: IDS.routes.city, organisation_id: IDS.org, company_id: IDS.acm, area_id: IDS.areas.kensington, name: "City Bowl Staff Run", code: "STAFF-C", description: "Kensington → Woodstock → District Six → Acme Foreshore Tower", status: "active", created_by: demoUserId },
      { id: IDS.routes.atlantic, organisation_id: IDS.org, company_id: IDS.acm, area_id: IDS.areas.houtbay, name: "Atlantic Staff Run", code: "STAFF-A", description: "Hout Bay Harbour → Acme Foreshore Tower", status: "active", created_by: demoUserId },
    ]),
  );

  must(
    "route_stops",
    await sb.from("route_stops").insert([
      { id: "a8100000-0000-4000-8000-000000000001", organisation_id: IDS.org, route_id: IDS.routes.north, sequence: 1, pickup_point_id: IDS.pickups.parklands, label: "Parklands Circle", dwell_minutes: 3 },
      { id: "a8100000-0000-4000-8000-000000000002", organisation_id: IDS.org, route_id: IDS.routes.north, sequence: 2, pickup_point_id: IDS.pickups.milnerton, label: "Milnerton Racecourse Rd", dwell_minutes: 3 },
      { id: "a8100000-0000-4000-8000-000000000003", organisation_id: IDS.org, route_id: IDS.routes.north, sequence: 3, pickup_point_id: IDS.pickups.dunoon, label: "Dunoon Main Rd", dwell_minutes: 3 },
      { id: "a8100000-0000-4000-8000-000000000004", organisation_id: IDS.org, route_id: IDS.routes.north, sequence: 4, site_id: IDS.sites.century, label: "Acme Century City Hub", dwell_minutes: 5 },
      { id: "a8100000-0000-4000-8000-000000000005", organisation_id: IDS.org, route_id: IDS.routes.city, sequence: 1, pickup_point_id: IDS.pickups.kensington, label: "Kensington Civic", dwell_minutes: 3 },
      { id: "a8100000-0000-4000-8000-000000000006", organisation_id: IDS.org, route_id: IDS.routes.city, sequence: 2, pickup_point_id: IDS.pickups.woodstock, label: "Woodstock Station", dwell_minutes: 3 },
      { id: "a8100000-0000-4000-8000-000000000007", organisation_id: IDS.org, route_id: IDS.routes.city, sequence: 3, pickup_point_id: IDS.pickups.district6, label: "District Six Museum stop", dwell_minutes: 2 },
      { id: "a8100000-0000-4000-8000-000000000008", organisation_id: IDS.org, route_id: IDS.routes.city, sequence: 4, site_id: IDS.sites.foreshore, label: "Acme Foreshore Tower", dwell_minutes: 5 },
      { id: "a8100000-0000-4000-8000-000000000009", organisation_id: IDS.org, route_id: IDS.routes.atlantic, sequence: 1, pickup_point_id: IDS.pickups.houtbay, label: "Hout Bay Harbour", dwell_minutes: 4 },
      { id: "a8100000-0000-4000-8000-000000000010", organisation_id: IDS.org, route_id: IDS.routes.atlantic, sequence: 2, site_id: IDS.sites.foreshore, label: "Acme Foreshore Tower", dwell_minutes: 5 },
    ]),
  );

  must(
    "schedules",
    await sb.from("schedules").insert([
      { id: IDS.schedules.north, organisation_id: IDS.org, route_id: IDS.routes.north, name: "Weekday 06:15 North", days_of_week: [1, 2, 3, 4, 5], depart_time: "06:15:00", effective_from: ps, timezone: "Africa/Johannesburg", status: "active", created_by: demoUserId },
      { id: IDS.schedules.city, organisation_id: IDS.org, route_id: IDS.routes.city, name: "Weekday 06:30 City", days_of_week: [1, 2, 3, 4, 5], depart_time: "06:30:00", effective_from: ps, timezone: "Africa/Johannesburg", status: "active", created_by: demoUserId },
      { id: IDS.schedules.atlantic, organisation_id: IDS.org, route_id: IDS.routes.atlantic, name: "Weekday 06:00 Atlantic", days_of_week: [1, 2, 3, 4, 5], depart_time: "06:00:00", effective_from: ps, timezone: "Africa/Johannesburg", status: "active", created_by: demoUserId },
    ]),
  );

  const tripRows = [
    { id: IDS.trips.n1, route_id: IDS.routes.north, schedule_id: IDS.schedules.north, planned_start: ctIso(ps, "06:15:00"), planned_end: ctIso(ps, "07:30:00"), status: "completed", generation_key: `demo-north-${ps}` },
    { id: IDS.trips.n2, route_id: IDS.routes.north, schedule_id: IDS.schedules.north, planned_start: ctIso(ymd(addDays(periodStart, 2)), "06:15:00"), planned_end: ctIso(ymd(addDays(periodStart, 2)), "07:30:00"), status: "completed", generation_key: `demo-north-${ymd(addDays(periodStart, 2))}` },
    { id: IDS.trips.c1, route_id: IDS.routes.city, schedule_id: IDS.schedules.city, planned_start: ctIso(ps, "06:30:00"), planned_end: ctIso(ps, "07:30:00"), status: "completed", generation_key: `demo-city-${ps}` },
    { id: IDS.trips.c2, route_id: IDS.routes.city, schedule_id: IDS.schedules.city, planned_start: ctIso(ymd(addDays(periodStart, 2)), "06:30:00"), planned_end: ctIso(ymd(addDays(periodStart, 2)), "07:30:00"), status: "assigned", generation_key: `demo-city-${ymd(addDays(periodStart, 2))}` },
    { id: IDS.trips.a1, route_id: IDS.routes.atlantic, schedule_id: IDS.schedules.atlantic, planned_start: ctIso(ps, "06:00:00"), planned_end: ctIso(ps, "07:30:00"), status: "completed", generation_key: `demo-atl-${ps}` },
    { id: IDS.trips.a2, route_id: IDS.routes.north, schedule_id: IDS.schedules.north, planned_start: ctIso(wm, "06:15:00"), planned_end: ctIso(wm, "07:30:00"), status: "planned", generation_key: `demo-north-${wm}` },
  ].map((t) => ({
    ...t,
    organisation_id: IDS.org,
    company_id: IDS.acm,
    created_by: demoUserId,
  }));

  must("trips", await sb.from("trips").insert(tripRows));

  must(
    "trip_assignments",
    await sb.from("trip_assignments").insert([
      { id: "aa000000-0000-4000-8000-000000000001", organisation_id: IDS.org, trip_id: IDS.trips.n1, driver_id: IDS.drivers.thabo, vehicle_id: IDS.vehicles.q1, assigned_by: demoUserId },
      { id: "aa000000-0000-4000-8000-000000000002", organisation_id: IDS.org, trip_id: IDS.trips.n2, driver_id: IDS.drivers.farouk, vehicle_id: IDS.vehicles.q1, assigned_by: demoUserId },
      { id: "aa000000-0000-4000-8000-000000000003", organisation_id: IDS.org, trip_id: IDS.trips.c1, driver_id: IDS.drivers.ayesha, vehicle_id: IDS.vehicles.q2, assigned_by: demoUserId },
      { id: "aa000000-0000-4000-8000-000000000004", organisation_id: IDS.org, trip_id: IDS.trips.c2, driver_id: IDS.drivers.johan, vehicle_id: IDS.vehicles.e1, assigned_by: demoUserId },
      { id: "aa000000-0000-4000-8000-000000000005", organisation_id: IDS.org, trip_id: IDS.trips.a1, driver_id: IDS.drivers.lindiwe, vehicle_id: IDS.vehicles.q3, assigned_by: demoUserId },
    ]),
  );

  must(
    "fuel_fillups",
    await sb.from("fuel_fillups").insert([
      { id: IDS.fuel.f1, organisation_id: IDS.org, vehicle_id: IDS.vehicles.q1, driver_id: IDS.drivers.thabo, company_id: IDS.acm, filled_at: ctIso(ps, "17:40:00"), odometer_km: 84210, litres: 55, unit_price: 23.45, total_amount: 1289.75, currency: "ZAR", station_name: "Engen Milnerton", created_by: demoUserId },
      { id: IDS.fuel.f2, organisation_id: IDS.org, vehicle_id: IDS.vehicles.q2, driver_id: IDS.drivers.ayesha, company_id: IDS.acm, filled_at: ctIso(ymd(addDays(periodStart, 1)), "18:10:00"), odometer_km: 76102, litres: 48.5, unit_price: 23.45, total_amount: 1137.33, currency: "ZAR", station_name: "Shell Woodstock", created_by: demoUserId },
      { id: IDS.fuel.f3, organisation_id: IDS.org, vehicle_id: IDS.vehicles.e1, driver_id: IDS.drivers.johan, company_id: IDS.acm, filled_at: ctIso(ymd(addDays(periodStart, 2)), "17:55:00"), odometer_km: 51240, litres: 32, unit_price: 23.89, total_amount: 764.48, currency: "ZAR", station_name: "Caltex Kensington", created_by: demoUserId },
      { id: IDS.fuel.f4, organisation_id: IDS.org, vehicle_id: IDS.vehicles.q3, driver_id: IDS.drivers.chantal, company_id: IDS.acm, filled_at: ctIso(ymd(addDays(periodStart, 3)), "18:25:00"), odometer_km: 69880, litres: 52, unit_price: 23.45, total_amount: 1219.4, currency: "ZAR", station_name: "Engen Hout Bay", created_by: demoUserId },
    ]),
  );

  must(
    "invoices",
    await sb.from("invoices").insert({
      id: IDS.invoice,
      organisation_id: IDS.org,
      company_id: IDS.acm,
      period_start: ps,
      period_end: pe,
      status: "issued",
      currency: "ZAR",
      subtotal: 4410.96,
      total: 4410.96,
      notes: "Weekly staff transport fuel recovery — Cape Shuttle Ops",
      generated_by: demoUserId,
      issued_at: ctIso(pe, "09:00:00"),
    }),
  );

  must(
    "invoice_lines",
    await sb.from("invoice_lines").insert([
      { id: "ac000000-0000-4000-8000-000000000011", organisation_id: IDS.org, invoice_id: IDS.invoice, line_type: "fuel", fuel_fillup_id: IDS.fuel.f1, description: "Fuel — Quantam 1 (Engen Milnerton)", quantity: 55, unit_price: 23.45, amount: 1289.75 },
      { id: "ac000000-0000-4000-8000-000000000012", organisation_id: IDS.org, invoice_id: IDS.invoice, line_type: "fuel", fuel_fillup_id: IDS.fuel.f2, description: "Fuel — Quantam 2 (Shell Woodstock)", quantity: 48.5, unit_price: 23.45, amount: 1137.33 },
      { id: "ac000000-0000-4000-8000-000000000013", organisation_id: IDS.org, invoice_id: IDS.invoice, line_type: "fuel", fuel_fillup_id: IDS.fuel.f3, description: "Fuel — Ertiga 1 (Caltex Kensington)", quantity: 32, unit_price: 23.89, amount: 764.48 },
      { id: "ac000000-0000-4000-8000-000000000014", organisation_id: IDS.org, invoice_id: IDS.invoice, line_type: "fuel", fuel_fillup_id: IDS.fuel.f4, description: "Fuel — Quantam 3 (Engen Hout Bay)", quantity: 52, unit_price: 23.45, amount: 1219.4 },
    ]),
  );

  printCreds();
}

function printCreds() {
  console.log("\n=== Cape Shuttle Ops demo ready ===");
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log("Also linked: yaseenjacobs97@gmail.com (org admin) — use your normal password.");
  console.log("Open /dashboard after login.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
