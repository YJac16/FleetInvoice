/**
 * Raster favicon generator for GoOps brand assets.
 * Usage: node scripts/generate-goops-icons.mjs
 *
 * Sources:
 *   public/brand/goops-logo.png  — full lockup
 *   public/brand/goops-mark.svg  — vector mark (also used as favicon art)
 *   public/icon.svg               — app icon tile
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconSvg = readFileSync(join(root, "public/icon.svg"));

const { default: sharp } = await import("sharp");

const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-48x48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

for (const { name, size } of sizes) {
  const out = join(root, "public", name);
  await sharp(iconSvg).resize(size, size).png().toFile(out);
  console.log(`Wrote ${name}`);
}

const favicon32 = await sharp(iconSvg).resize(32, 32).png().toBuffer();
writeFileSync(join(root, "public/favicon.ico"), favicon32);
console.log("Wrote favicon.ico");
