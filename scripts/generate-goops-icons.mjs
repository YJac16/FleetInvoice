/**
 * Raster icon generator for the GoOps mark.
 * Usage: node scripts/generate-goops-icons.mjs
 *
 * Fits the whole public/brand/goops-mark.svg (G + infinity arrow) inside a
 * square navy tile. It does not crop the wide mark.
 *
 * Standard icons ("any"): mark centred, about 11% padding on the long axis
 * (content width ≈ 78% of the tile). The mark is ~1.9:1, so the short axis
 * has more navy above and below.
 *
 * Maskable icons: the same mark scaled to ~66% of the tile width so it sits
 * inside the Android adaptive-icon safe zone. These are separate files;
 * purpose "any" and "maskable" must not be combined on one asset.
 *
 * Browser and apple-touch icons are linked from metadata in app/layout.tsx.
 * This script does not write app/icon.png or app/apple-icon.png — those App
 * Router files make Next inject a second set of <link> tags.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const markPath = join(root, "public/brand/goops-mark.svg");

const { default: sharp } = await import("sharp");

const NAVY = "#0B1F3B";
const PAD_FRACTION = 0.11;
const MASKABLE_CONTENT = 0.66;

const markSvg = readFileSync(markPath, "utf8");
const markInner = markSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .trim();

const measureSize = 1200;
const { data, info } = await sharp(Buffer.from(markSvg))
  .resize(measureSize, Math.round((measureSize * 630) / 1200), { fit: "fill" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let minX = info.width;
let minY = info.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * info.channels + 3];
    if (alpha < 16) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) {
  throw new Error("GoOps mark SVG rendered with no visible pixels");
}

const scaleX = 1200 / info.width;
const scaleY = 630 / info.height;
const ink = {
  x: minX * scaleX,
  y: minY * scaleY,
  w: (maxX - minX + 1) * scaleX,
  h: (maxY - minY + 1) * scaleY,
};
console.log(
  `Mark ink ${ink.w.toFixed(1)}x${ink.h.toFixed(1)} (ratio ${(ink.w / ink.h).toFixed(3)})`,
);

function tileSvg(size, { maskable = false } = {}) {
  // Standard tiles keep ~11% navy on the long axis (~78% content width).
  // Maskable tiles shrink the mark to ~66% so it stays in the safe zone.
  const innerW = maskable
    ? Math.max(1, Math.round(size * MASKABLE_CONTENT))
    : Math.max(1, size - Math.round(size * PAD_FRACTION) * 2);
  let innerH = Math.max(1, Math.round(innerW * (ink.h / ink.w)));
  const maxInner = size - 2;
  if (innerH > maxInner) {
    innerH = maxInner;
    innerW = Math.max(1, Math.round(innerH * (ink.w / ink.h)));
  }
  const left = Math.round((size - innerW) / 2);
  const top = Math.round((size - innerH) / 2);
  const scale = innerW / ink.w;
  const tx = left - ink.x * scale;
  const ty = top - ink.y * scale;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  <g transform="translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${scale.toFixed(8)})">
    <svg x="0" y="0" width="1200" height="630" viewBox="0 0 1200 630">
      ${markInner}
    </svg>
  </g>
</svg>`;
  return { svg, innerW, innerH, left, top };
}

async function renderTile(size, options) {
  const { svg } = tileSvg(size, options);
  return sharp(Buffer.from(svg)).resize(size, size).png();
}

const anyFiles = [
  ["public/favicon-16x16.png", 16],
  ["public/favicon-32x32.png", 32],
  ["public/favicon-48x48.png", 48],
  ["public/apple-touch-icon.png", 180],
  ["public/apple-touch-icon-precomposed.png", 180],
  ["public/apple-touch-icon-152x152.png", 152],
  ["public/apple-touch-icon-167x167.png", 167],
  ["public/apple-touch-icon-180x180.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/brand/goops-favicon.png", 32],
  ["public/brand/goops-apple-touch.png", 180],
];

const pngBySize = new Map();

for (const [rel, size] of anyFiles) {
  let png = pngBySize.get(size);
  if (!png) {
    png = await (await renderTile(size)).toBuffer();
    pngBySize.set(size, png);
  }
  writeFileSync(join(root, rel), png);
  console.log(`Wrote ${rel}`);
}

for (const [rel, size] of [
  ["public/icon-maskable-192.png", 192],
  ["public/icon-maskable-512.png", 512],
]) {
  const png = await (await renderTile(size, { maskable: true })).toBuffer();
  writeFileSync(join(root, rel), png);
  console.log(`Wrote ${rel}`);
}

function pngIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const { size, buffer } = images[i];
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buffer.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buffer.length;
  }
  return Buffer.concat([header, dir, ...images.map((image) => image.buffer)]);
}

const ico = pngIco([16, 32, 48].map((size) => ({ size, buffer: pngBySize.get(size) })));
writeFileSync(join(root, "public/favicon.ico"), ico);
console.log("Wrote public/favicon.ico (16, 32, 48)");

const iconSvg = tileSvg(512).svg.replace(
  `width="512" height="512" viewBox="0 0 512 512"`,
  `viewBox="0 0 512 512"`,
);
writeFileSync(join(root, "public/icon.svg"), iconSvg);
console.log("Wrote public/icon.svg");

for (const dead of ["app/icon.png", "app/apple-icon.png"]) {
  rmSync(join(root, dead), { force: true });
  console.log(`Removed ${dead}`);
}
