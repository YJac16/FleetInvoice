/**
 * Raster favicon generator for GoOps brand assets.
 * Usage: node scripts/generate-goops-icons.mjs
 *
 * Favicons are a square crop of public/brand/goops-mark.png (G + arrow),
 * not the letterboxed full lockup. Also writes app/icon.png and
 * app/apple-icon.png so Next.js emits hashed URLs that bust Safari's cache.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const markPath = join(root, "public/brand/goops-mark.png");

const { default: sharp } = await import("sharp");

const mark = sharp(markPath);
const meta = await mark.metadata();
const mw = meta.width ?? 1200;
const mh = meta.height ?? 630;
const side = mh;
const x0 = Math.round((mw - side) * 0.18);

async function tile(size) {
  const inner = Math.max(1, Math.round(size * 0.92));
  const pad = Math.floor((size - inner) / 2);
  const cropped = await sharp(markPath)
    .extract({ left: x0, top: 0, width: side, height: side })
    .resize(inner, inner)
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 11, g: 31, b: 59, alpha: 1 },
    },
  })
    .composite([{ input: cropped, left: pad, top: pad }])
    .png();
}

const publicSizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-48x48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "apple-touch-icon-precomposed.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

for (const { name, size } of publicSizes) {
  await (await tile(size)).toFile(join(root, "public", name));
  console.log(`Wrote public/${name}`);
}

const ico32 = await (await tile(32)).png().toBuffer();
writeFileSync(join(root, "public", "favicon.ico"), ico32);
console.log("Wrote public/favicon.ico");

const appDir = join(root, "app");
await (await tile(512)).toFile(join(appDir, "icon.png"));
await (await tile(180)).toFile(join(appDir, "apple-icon.png"));
console.log("Wrote app/icon.png, app/apple-icon.png");
