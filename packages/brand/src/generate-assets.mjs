/**
 * Generates brand assets from raster masters in `site/assets/brand/`:
 *   - openadminjs-logo-new.png  (required) — full wordmark / horizontal logo
 *   - openadminjs-icon-new.png (optional) — square mark for favicon / app icon; falls back to logo if missing
 *
 * Outputs PNG + thin SVG wrappers (`<image href="…"/>`) for each target directory.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `packages/brand/src` → monorepo root */
const repoRoot = join(__dirname, "../../..");

const LOGO_SRC = join(repoRoot, "site/assets/brand/openadminjs-logo-new.png");
const targets = [
  "apps/admin/public/brand",
  "apps/web/public/brand",
  "packages/cli/template/apps/web/public/brand",
  "packages/create-openadminjs/template/apps/web/public/brand",
  "packages/brand/apps/web/public/brand",
  "packages/brand/apps/admin/public/brand",
  "site/assets/brand"
];

const UNUSED_BRAND_FILES = [
  "openadminjs-logo-horizontal.svg",
  "openadminjs-logo.svg",
  "openadminjs-logo-dark.svg",
  "openadminjs-logo-monochrome.svg",
  "openadminjs-icon.png",
  "openadminjs-icon.svg",
  "og-image.svg",
  "favicon.png"
];

/** SVG shell so browsers can scale; raster lives alongside as `href`. */
function svgRasterImage(href, w, h, label) {
  const safe = String(label).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" role="img" aria-label="${safe}"><image xlink:href="${href}" href="${href}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

async function extractLogoMark(logoBuf) {
  const { data, info } = await sharp(logoBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alphaIndex = channels - 1;

  const activeCols = new Array(width).fill(false);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const idx = (y * width + x) * channels + alphaIndex;
      if (data[idx] > 18) {
        activeCols[x] = true;
        break;
      }
    }
  }

  let symbolStart = activeCols.findIndex(Boolean);
  if (symbolStart < 0) symbolStart = 0;

  let symbolEnd = width - 1;
  let gap = 0;
  for (let x = symbolStart; x < width; x += 1) {
    if (activeCols[x]) {
      gap = 0;
      symbolEnd = x;
      continue;
    }
    gap += 1;
    if (gap >= 10) break;
  }

  const activeRows = new Array(height).fill(false);
  for (let y = 0; y < height; y += 1) {
    for (let x = symbolStart; x <= symbolEnd; x += 1) {
      const idx = (y * width + x) * channels + alphaIndex;
      if (data[idx] > 18) {
        activeRows[y] = true;
        break;
      }
    }
  }

  let top = activeRows.findIndex(Boolean);
  if (top < 0) top = 0;
  let bottom = height - 1;
  for (let y = height - 1; y >= 0; y -= 1) {
    if (activeRows[y]) {
      bottom = y;
      break;
    }
  }

  const markW = Math.max(1, symbolEnd - symbolStart + 1);
  const markH = Math.max(1, bottom - top + 1);
  const side = Math.max(markW, markH);
  const cx = symbolStart + markW / 2;
  const cy = top + markH / 2;

  let left = Math.floor(cx - side / 2);
  let cropTop = Math.floor(cy - side / 2);
  if (left < 0) left = 0;
  if (cropTop < 0) cropTop = 0;
  if (left + side > width) left = width - side;
  if (cropTop + side > height) cropTop = height - side;

  return sharp(logoBuf)
    .extract({ left: Math.max(0, left), top: Math.max(0, cropTop), width: Math.min(side, width), height: Math.min(side, height) })
    .resize(512, 512, { fit: "cover" })
    .png()
    .toBuffer();
}

async function writeBrandToDir(targetDir) {
  mkdirSync(targetDir, { recursive: true });

  const logoBuf = readFileSync(LOGO_SRC);
  const logoMeta = await sharp(logoBuf).metadata();
  const lw = logoMeta.width ?? 800;
  const lh = logoMeta.height ?? 200;

  writeFileSync(join(targetDir, "openadminjs-logo-new.png"), logoBuf);

  const monoPng = await sharp(logoBuf).grayscale().png().toBuffer();
  writeFileSync(join(targetDir, "openadminjs-logo-monochrome.png"), monoPng);

  const iconBuf = await extractLogoMark(logoBuf);
  writeFileSync(join(targetDir, "openadminjs-icon-new.png"), iconBuf);

  writeFileSync(join(targetDir, "favicon.svg"), svgRasterImage("openadminjs-icon-new.png", 512, 512, "OpenAdminJS"));

  const apple = await sharp(iconBuf).resize(180, 180, { fit: "cover" }).png().toBuffer();
  writeFileSync(join(targetDir, "apple-touch-icon.png"), apple);

  const ogW = 1200;
  const ogH = 630;
  const logoForOg = await sharp(logoBuf).resize(560, null, { fit: "inside" }).png().toBuffer();
  const ogLm = await sharp(logoForOg).metadata();
  const logoH = ogLm.height ?? 0;
  const top = Math.max(0, Math.round((ogH - logoH) / 2));
  const ogPng = await sharp({
    create: { width: ogW, height: ogH, channels: 4, background: { r: 248, g: 251, b: 255, alpha: 1 } }
  })
    .composite([{ input: logoForOg, left: 72, top }])
    .png()
    .toBuffer();
  writeFileSync(join(targetDir, "og-image.png"), ogPng);

  for (const filename of UNUSED_BRAND_FILES) {
    const full = join(targetDir, filename);
    if (existsSync(full)) unlinkSync(full);
  }
}

async function main() {
  if (process.argv.includes("--check")) {
    if (!existsSync(LOGO_SRC)) {
      console.error(`Missing required source: ${LOGO_SRC}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (!existsSync(LOGO_SRC)) {
    throw new Error(`Missing required source logo: ${LOGO_SRC}`);
  }

  for (const rel of targets) {
    const dir = join(repoRoot, rel);
    await writeBrandToDir(dir);
    console.log("Wrote", rel);
  }
  console.log("Brand assets generated from openadminjs-logo-new.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
