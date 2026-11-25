/**
 * Parser for the official DMPR (Department of Mineral and Petroleum
 * Resources, formerly DMRE) monthly retail fuel price release.
 *
 * The release page carries a table of prices per fuel grade with a Coastal
 * and an Inland (Gauteng) column, in cents per litre (c/l), plus the
 * effective date ("... effective from Wednesday, 3 December 2025"). This
 * parser is deliberately strict: it returns rows only when it finds an
 * effective date AND all four grades in both regions with plausible values;
 * anything else is a parse failure, so the cron changes nothing and notifies
 * finance instead. No price is ever defaulted or invented here.
 */

export type DmprPriceRow = {
  fuel_type: "diesel_50ppm" | "diesel_500ppm" | "petrol_95" | "petrol_93";
  region: "coastal" | "inland";
  effective_from: string;
  /** Rand per litre, 4 dp. */
  price_per_litre: number;
};

export type DmprParseResult =
  | { ok: true; effectiveFrom: string; rows: DmprPriceRow[] }
  | { ok: false; reason: string };

/** Official release page; override with DMPR_FUEL_PRICE_URL. */
export const DEFAULT_DMPR_FUEL_PRICE_URL =
  "https://www.dmre.gov.za/energy-resources/energy-sources/petroleum/fuel-prices";

/** The source tag written on global rows. Never "DEMO". */
export const DMPR_SOURCE = "dmpr_official";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const GRADES: Array<{ fuel_type: DmprPriceRow["fuel_type"]; match: RegExp }> = [
  { fuel_type: "petrol_95", match: /\b(petrol|ulp)\b[^|]*\b95\b/i },
  { fuel_type: "petrol_93", match: /\b(petrol|ulp)\b[^|]*\b93\b/i },
  { fuel_type: "diesel_50ppm", match: /\bdiesel\b[^|]*(0[.,]005\s*%|\b50\s*ppm)/i },
  { fuel_type: "diesel_500ppm", match: /\bdiesel\b[^|]*(0[.,]05\s*%|\b500\s*ppm)/i },
];

/** Plausible retail band in R/l; outside it the page is not what we expect. */
const MIN_RAND = 5;
const MAX_RAND = 60;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*37;|&percnt;/gi, "%")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** HTML tables -> rows of cell text. */
export function extractTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const tdRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1]))) cells.push(cellText(td[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** "3 December 2025" / "Wednesday, 3 December 2025" / "2025-12-03" -> ISO date. */
export function parseEffectiveDate(text: string): string | null {
  const plain = cellText(text);
  const iso = plain.match(/effective[^.]{0,60}?(\d{4})-(\d{2})-(\d{2})/i);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = plain.match(
    /effective(?:\s+(?:from|on|as\s+(?:of|from)))?[\s:,]+(?:[a-z]+day,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})/i
  );
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(Number(m[3]), month, day));
  if (date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** "2 046.43" / "2,046.43" / "2046,43" (c/l) or "20.46" (R/l) -> R/l. */
export function parseLitrePrice(cell: string): number | null {
  const cleaned = cell.replace(/[Rc]\s*\/?\s*l?/gi, " ").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^-?(\d{1,2}(?:[ ,]\d{3})+|\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const n = Number(`${m[1].replace(/[ ,]/g, "")}.${m[2] ?? "0"}`);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rand = n >= 100 ? n / 100 : n;
  if (rand < MIN_RAND || rand > MAX_RAND) return null;
  return Math.round(rand * 10000) / 10000;
}

export function parseDmprRelease(html: string): DmprParseResult {
  if (!html || html.length < 50) return { ok: false, reason: "Empty release page" };
  const effectiveFrom = parseEffectiveDate(html);
  if (!effectiveFrom) return { ok: false, reason: "No effective date found in the release" };

  const rows = extractTableRows(html);
  let coastalCol = -1;
  let inlandCol = -1;
  const found = new Map<string, DmprPriceRow>();

  for (const cells of rows) {
    const lower = cells.map((c) => c.toLowerCase());
    const c = lower.findIndex((x) => /\bcoast(al)?\b/.test(x));
    const i = lower.findIndex((x) => /\b(inland|gauteng)\b/.test(x));
    if (c >= 0 && i >= 0) {
      coastalCol = c;
      inlandCol = i;
      continue;
    }
    if (coastalCol < 0) continue;
    const label = cells[0] ?? "";
    const grade = GRADES.find((g) => g.match.test(label));
    if (!grade) continue;
    for (const [region, col] of [["coastal", coastalCol], ["inland", inlandCol]] as const) {
      const price = parseLitrePrice(cells[col] ?? "");
      const key = `${grade.fuel_type}|${region}`;
      if (price != null && !found.has(key)) {
        found.set(key, { fuel_type: grade.fuel_type, region, effective_from: effectiveFrom, price_per_litre: price });
      }
    }
  }

  if (coastalCol < 0) return { ok: false, reason: "No Coastal / Inland price table found" };
  const missing: string[] = [];
  for (const g of GRADES) {
    for (const region of ["coastal", "inland"]) {
      if (!found.has(`${g.fuel_type}|${region}`)) missing.push(`${g.fuel_type} ${region}`);
    }
  }
  if (missing.length) return { ok: false, reason: `Missing prices: ${missing.join(", ")}` };
  return { ok: true, effectiveFrom, rows: [...found.values()] };
}
