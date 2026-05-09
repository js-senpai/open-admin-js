import { welcomeAiPlugin } from "./plugins/welcome-ai.plugin";

/**
 * Example plugin entry for apps/api/plugins.manifest.json.
 */
export const pluginManifestEntryExample = {
  id: "com.example.welcome-ai",
  package: "@acme/openadmin-welcome-ai",
  enabled: true,
  trustMode: "sandboxed" as const,
  capabilities: ["seo.extend", "admin.ui.extend"] as const,
  config: {
    defaultModel: "gpt-4o-mini"
  }
};

/**
 * Copy into apps/api/.env to enable AI assistant features.
 */
export const aiEnvExample = {
  OPENADMIN_AI_ENABLED: "1",
  OPENADMIN_AI_PROVIDER: "openai",
  OPENADMIN_AI_MODEL: "gpt-4o-mini",
  OPENADMIN_AI_API_KEY: "<set-your-key>",
  OPENADMIN_AI_MAX_TOKENS: "1200"
} as const;

/**
 * Merge these snippets into your generated app.
 */
export const pluginAiExample = {
  plugin: welcomeAiPlugin,
  manifestEntry: pluginManifestEntryExample,
  env: aiEnvExample
};
