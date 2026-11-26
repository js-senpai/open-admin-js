"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { getUiLocale, LOCALE_LABELS, setUiLocale, SUPPORTED_UI_LOCALES } from "../../lib/locale";

export default function SettingsPage() {
  const [locale, setLocale] = useState("en");
  useEffect(() => setLocale(getUiLocale()), []);
  return <AppShell><h1 className="text-3xl font-bold">Settings</h1>
    <section className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-700">
      <h2 className="font-semibold">Interface language</h2>
      <label className="mt-4 block text-sm">Language
        <select className="ml-3 rounded-lg border bg-transparent p-2" value={locale} onChange={event => { setUiLocale(event.target.value); setLocale(event.target.value); window.location.reload(); }}>
          {SUPPORTED_UI_LOCALES.map(value => <option key={value} value={value}>{LOCALE_LABELS[value]}</option>)}
        </select>
      </label>
    </section>
    <section className="mt-4 rounded-xl border border-slate-200 p-5 dark:border-slate-700"><h2 className="font-semibold">Experimental integrations</h2><p className="mt-2 text-sm text-slate-500">AI is opt-in and read-only. The deployment operator manages provider credentials. OIDC remains disabled pending verified server-side exchange.</p></section>
  </AppShell>;
}
