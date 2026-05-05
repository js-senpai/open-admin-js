/**
 * Generates brand assets from raster masters in `site/assets/brand/`:
 *   - openadminjs-logo-new.png  (required) — full wordmark / horizontal logo
 *   - openadminjs-icon-new.png (optional) — square mark for favicon / app icon; falls back to logo if missing
 *
 * Outputs PNG + thin SVG wrappers (`<image href="…"/>`) for each target directory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `packages/brand/src` → monorepo root */
const repoRoot = join(__dirname, "../../..");

const LOGO_SRC = join(repoRoot, "site/assets/brand/openadminjs-logo-new.png");
const ICON_SRC = join(repoRoot, "site/assets/brand/openadminjs-icon-new.png");

const targets = [
  "apps/admin/public/brand",
  "apps/web/public/brand",
  "packages/cli/template/apps/web/public/brand",
  "packages/create-openadminjs/template/apps/web/public/brand",
  "packages/brand/apps/web/public/brand",
  "packages/brand/apps/admin/public/brand",
  "site/assets/brand"
];

/** SVG shell so browsers can scale; raster lives alongside as `href`. */
function svgRasterImage(href, w, h, label) {
  const safe = String(label).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" role="img" aria-label="${safe}"><image xlink:href="${href}" href="${href}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

function svgLogoOnDarkBg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" role="img" aria-label="OpenAdminJS"><rect width="${w}" height="${h}" fill="#0f172a"/><image xlink:href="openadminjs-logo-new.png" href="openadminjs-logo-new.png" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" opacity="0.94"/></svg>`;
}

async function writeBrandToDir(targetDir) {
  mkdirSync(targetDir, { recursive: true });

  const logoBuf = readFileSync(LOGO_SRC);
  const logoMeta = await sharp(logoBuf).metadata();
  const lw = logoMeta.width ?? 800;
  const lh = logoMeta.height ?? 200;

  writeFileSync(join(targetDir, "openadminjs-logo-new.png"), logoBuf);
  const horizSvg = svgRasterImage("openadminjs-logo-new.png", lw, lh, "OpenAdminJS");
  writeFileSync(join(targetDir, "openadminjs-logo-horizontal.svg"), horizSvg);
  writeFileSync(join(targetDir, "openadminjs-logo.svg"), horizSvg);
  writeFileSync(join(targetDir, "openadminjs-logo-dark.svg"), svgLogoOnDarkBg(lw, lh));

  const iconBuf = existsSync(ICON_SRC) ? readFileSync(ICON_SRC) : logoBuf;
  const icon96 = await sharp(iconBuf).resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  writeFileSync(join(targetDir, "openadminjs-icon.png"), icon96);
  writeFileSync(join(targetDir, "openadminjs-icon.svg"), svgRasterImage("openadminjs-icon.png", 96, 96, "OpenAdminJS icon"));

  const monoPng = await sharp(logoBuf).grayscale().png().toBuffer();
  const monoMeta = await sharp(monoPng).metadata();
  const mw = monoMeta.width ?? lw;
  const mh = monoMeta.height ?? lh;
  writeFileSync(join(targetDir, "openadminjs-logo-monochrome.png"), monoPng);
  writeFileSync(join(targetDir, "openadminjs-logo-monochrome.svg"), svgRasterImage("openadminjs-logo-monochrome.png", mw, mh, "OpenAdminJS"));

  const fav32 = await sharp(iconBuf).resize(32, 32, { fit: "cover" }).png().toBuffer();
  writeFileSync(join(targetDir, "favicon.png"), fav32);
  writeFileSync(join(targetDir, "favicon.svg"), svgRasterImage("favicon.png", 32, 32, "OpenAdminJS"));

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
  writeFileSync(join(targetDir, "og-image.svg"), svgRasterImage("og-image.png", ogW, ogH, "OpenAdminJS"));
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
