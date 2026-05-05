/**
 * Public brand asset paths for the admin app.
 * Raster masters live in `public/brand/`; `favicon.svg` is a true vector SVG (transparent bg).
 * To regenerate, run `pnpm brand:assets` from the repo root.
 */
export const BRAND = {
  /** True vector SVG favicon — used as primary; transparent background, scales perfectly */
  favicon: "/brand/favicon.svg",
  /** Raster fallback for browsers that don't support SVG favicons */
  faviconPng: "/brand/openadminjs-icon-new.png",
  appleTouch: "/brand/apple-touch-icon.png",
  ogImage: "/brand/og-image.png",
  ogImageSvg: "/brand/og-image.svg",
  mark: "/brand/openadminjs-icon.png",
  markSvg: "/brand/openadminjs-icon.svg",
  /** Primary color logo (PNG from design source). */
  logoNew: "/brand/openadminjs-logo-new.png",
  logoHorizontalSvg: "/brand/openadminjs-logo-horizontal.svg",
  logoDarkSvg: "/brand/openadminjs-logo-dark.svg",
  logoMonochromePng: "/brand/openadminjs-logo-monochrome.png"
} as const;
