const STORAGE_KEY = "openadminjs.locale";

/** BCP-47 locale for admin labels (must match resource `i18n.locales` where defined). */
export function getUiLocale(): string {
  if (typeof window === "undefined") return "en";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "en";
  } catch {
    return "en";
  }
}

export function setUiLocale(locale: string): void {
  if (typeof window === "undefined") return;
  if (!SUPPORTED_UI_LOCALES.includes(locale as SupportedUiLocale)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable in this context */
  }
}

/**
 * Extend this tuple to add more admin UI locales.
 * Each entry must match the `i18n.locales` array in the relevant `defineResource` calls
 * AND have a corresponding translation block in the resource's `i18n.translations` map.
 *
 * Example to add French:
 *   1. Add "fr" here
 *   2. Add `fr: { label: "Articles" }` to each resource's `i18n.translations`
 *   3. Re-export the locale from `packages/core` if you need typed resource translation helpers
 */
export const SUPPORTED_UI_LOCALES = ["en", "ru"] as const;
export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

/** Human-readable display names for locale codes. Add an entry when adding a new locale. */
export const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  ru: "Русский"
};

/**
 * Programmatically register a new locale at runtime (e.g. from a plugin or user settings page).
 * The locale is persisted to localStorage; the page must be refreshed to apply label changes.
 */
export function registerAndApplyLocale(locale: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
}
