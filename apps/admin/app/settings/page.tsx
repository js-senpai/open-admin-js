"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";
import { getUiLocale, LOCALE_LABELS, setUiLocale, SUPPORTED_UI_LOCALES, type SupportedUiLocale } from "../../lib/locale";
import { Bot, Languages, Plus, Save, Trash2 } from "lucide-react";

type ProviderKind = "openai" | "anthropic" | "gemini";
type AiProvider = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
};

export default function SettingsPage() {
  const [adminLocale, setAdminLocale] = useState<string>("en");
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [activeProvider, setActiveProvider] = useState("");
  const [tokenProviderId, setTokenProviderId] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setAdminLocale(getUiLocale());
  }, []);

  async function loadConfig() {
    const config = await api<{
      providers: AiProvider[];
      activeProvider: string;
      tokenConfigured: Record<string, boolean>;
    }>("/admin/ai/config");
    setProviders(config.providers);
    setActiveProvider(config.activeProvider);
    setTokenProviderId(config.activeProvider);
    setConfigured(config.tokenConfigured);
  }

  useEffect(() => {
    void loadConfig().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Не удалось загрузить AI-настройки");
    });
  }, []);

  async function saveProviders() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await api<{
        providers: AiProvider[];
        activeProvider: string;
        tokenConfigured: Record<string, boolean>;
      }>("/admin/ai/config", {
        method: "PUT",
        body: JSON.stringify({ providers, activeProvider })
      });
      setProviders(response.providers);
      setActiveProvider(response.activeProvider);
      setConfigured(response.tokenConfigured);
      setStatus("AI-настройки сохранены.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось сохранить AI-настройки");
    } finally {
      setSaving(false);
    }
  }

  async function saveToken() {
    if (!tokenProviderId) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await api<{ tokenConfigured: Record<string, boolean> }>("/admin/ai/config", {
        method: "PUT",
        body: JSON.stringify({
          tokenProviderId,
          token: tokenValue
        })
      });
      setConfigured(response.tokenConfigured);
      setTokenValue("");
      setStatus("Токен обновлён.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось обновить токен");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="card space-y-4 p-6 animate-in">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef3ff] text-[#2454ff]">
              <Languages className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Language</h2>
              <p className="text-sm text-slate-500">
                Admin labels use this locale and append <code className="text-xs">?locale=</code> to API requests.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="input-base max-w-xs"
              value={adminLocale}
              onChange={(e) => {
                const v = e.target.value as SupportedUiLocale;
                setAdminLocale(v);
                setUiLocale(v);
                window.location.reload();
              }}
            >
              {SUPPORTED_UI_LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCALE_LABELS[loc] ?? loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card p-6 animate-in stagger-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5a4]">Settings</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef3ff] text-[#2454ff]">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">AI-консультант</h1>
              <p className="text-sm text-slate-500">Выберите провайдер, настройте токен и управляйте кастомными AI-агентами.</p>
            </div>
          </div>
        </div>

        <div className="card space-y-4 p-6 animate-in stagger-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Провайдеры</h2>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                setProviders((current) => [
                  ...current,
                  { id: `provider-${current.length + 1}`, label: "Custom Provider", kind: "openai", baseUrl: "", model: "gpt-4o-mini" }
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Добавить
            </button>
          </div>

          <div className="space-y-3">
            {providers.map((provider, index) => (
              <div key={provider.id || `provider-${index}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-5">
                <input
                  value={provider.label}
                  onChange={(event) =>
                    setProviders((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item))
                    )
                  }
                  className="input-base"
                  placeholder="Label"
                />
                <input
                  value={provider.id}
                  onChange={(event) =>
                    setProviders((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, id: event.target.value.toLowerCase().replace(/\s+/g, "-") } : item))
                    )
                  }
                  className="input-base"
                  placeholder="id"
                />
                <select
                  value={provider.kind}
                  onChange={(event) =>
                    setProviders((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, kind: event.target.value as ProviderKind } : item))
                    )
                  }
                  className="input-base"
                >
                  <option value="openai">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
                <input
                  value={provider.model}
                  onChange={(event) =>
                    setProviders((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, model: event.target.value } : item))
                    )
                  }
                  className="input-base"
                  placeholder="model"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`btn-ghost flex-1 ${activeProvider === provider.id ? "border-[#2454ff] text-[#2454ff]" : ""}`}
                    onClick={() => setActiveProvider(provider.id)}
                  >
                    Активный
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setProviders((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label="Удалить провайдер"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={provider.baseUrl ?? ""}
                  onChange={(event) =>
                    setProviders((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, baseUrl: event.target.value } : item))
                    )
                  }
                  className="input-base md:col-span-5"
                  placeholder="https://api.provider.com/v1"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => void saveProviders()} disabled={saving}>
              <Save className="h-4 w-4" />
              Сохранить провайдеры
            </button>
          </div>
        </div>

        <div className="card space-y-4 p-6 animate-in stagger-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Токены</h2>
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <select value={tokenProviderId} onChange={(event) => setTokenProviderId(event.target.value)} className="input-base">
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label} {configured[provider.id] ? "• настроен" : "• нет токена"}
                </option>
              ))}
            </select>
            <input
              value={tokenValue}
              onChange={(event) => setTokenValue(event.target.value)}
              className="input-base"
              placeholder="Введите API token (оставьте пустым, чтобы удалить)"
            />
            <button type="button" className="btn-primary" onClick={() => void saveToken()} disabled={saving || !tokenProviderId}>
              Обновить токен
            </button>
          </div>
          {status && <p className="text-sm text-slate-500">{status}</p>}
        </div>
      </div>
    </AppShell>
  );
}
