/**
 * Install founder GoOps brand PNGs and generate favicon sizes from the mark.
 *
 * Place source files in goops-final-logos/ (or public/brand/ if already copied):
 *   - main-logo-dark-transparent.png
 *   - lockup-light-transparent.png
 *   - mark-transparent.png
 *
 * Optional pre-sized favicon samples (used when present):
 *   - favicon-32.png, favicon-180.png, favicon-512.png
 *
 * Usage: node scripts/install-founder-logos.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "goops-final-logos");
const brandDir = join(root, "public", "brand");
const publicDir = join(root, "public");

const brandFiles = [
  "main-logo-dark-transparent.png",
  "lockup-light-transparent.png",
  "mark-transparent.png",
];

function resolveSource(name) {
  const staged = join(sourceDir, name);
  if (existsSync(staged)) return staged;
  const inBrand = join(brandDir, name);
  if (existsSync(inBrand)) return inBrand;
  throw new Error(`Missing founder asset: ${name} (expected in goops-final-logos/ or public/brand/)`);
}

mkdirSync(brandDir, { recursive: true });
mkdirSync(sourceDir, { recursive: true });

for (const name of brandFiles) {
  const src = resolveSource(name);
  const dest = join(brandDir, name);
  if (src !== dest) {
    copyFileSync(src, dest);
    console.log(`Installed ${name} -> public/brand/`);
  }
}

const { default: sharp } = await import("sharp");

const markPath = join(brandDir, "mark-transparent.png");
const mark = readFileSync(markPath);

const faviconSamples = {
  "favicon-32x32.png": { sample: "favicon-32.png", size: 32 },
  "apple-touch-icon.png": { sample: "favicon-180.png", size: 180 },
  "favicon-512x512.png": { sample: "favicon-512.png", size: 512 },
};

for (const [outName, { sample, size }] of Object.entries(faviconSamples)) {
  const samplePath = join(sourceDir, sample);
  const out = join(publicDir, outName);
  if (existsSync(samplePath)) {
    copyFileSync(samplePath, out);
    console.log(`Wrote ${outName} (from founder sample ${sample})`);
  } else {
    await sharp(mark).resize(size, size).png().toFile(out);
    console.log(`Wrote ${outName} (resized from mark)`);
  }
}

for (const { name, size } of [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-48x48.png", size: 48 },
]) {
  const out = join(publicDir, name);
  await sharp(mark).resize(size, size).png().toFile(out);
  console.log(`Wrote ${name}`);
}

const favicon32 = await sharp(mark).resize(32, 32).png().toBuffer();
writeFileSync(join(publicDir, "favicon.ico"), favicon32);
console.log("Wrote favicon.ico");
