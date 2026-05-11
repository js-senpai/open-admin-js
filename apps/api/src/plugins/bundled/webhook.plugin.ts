import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";
import { resources } from "../../resources/registry";

type WebhookConfig = {
  url?: string;
  secret?: string;
  resources?: string[];
  timeoutMs?: number;
};

export const webhookBundledPlugin: OpenAdminPlugin<WebhookConfig> = {
  id: "io.openadminjs.webhook",
  version: "0.1.0",
  displayName: "Webhook bridge",
  register({ config, registerResourceHooks }) {
    const url = typeof config.url === "string" ? config.url.trim() : "";
    if (!url) return;
    const secret = typeof config.secret === "string" ? config.secret : "";
    const timeoutMs = typeof config.timeoutMs === "number" ? Math.max(500, config.timeoutMs) : 8_000;
    const allow = Array.isArray(config.resources) ? new Set(config.resources.map((r) => String(r))) : null;

    const emit = async (payload: Record<string, unknown>) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(secret ? { "x-openadminjs-signature": secret } : {})
          },
          body: JSON.stringify(payload)
        });
      } catch {
        /* fire-and-forget */
      } finally {
        clearTimeout(timeout);
      }
    };

    for (const resource of resources) {
      if (allow && !allow.has(resource.name)) continue;
      registerResourceHooks(resource.name, {
        afterCreate: async (ctx) => {
          await emit({ event: "resource.created", resource: ctx.resourceName, record: ctx.record, actor: ctx.user });
        },
        afterUpdate: async (ctx) => {
          await emit({
            event: "resource.updated",
            resource: ctx.resourceName,
            id: ctx.id,
            before: ctx.before,
            after: ctx.record,
            actor: ctx.user
          });
        },
        afterDelete: async (ctx) => {
          await emit({ event: "resource.deleted", resource: ctx.resourceName, id: ctx.id, actor: ctx.user });
        }
      });
    }
  }
};
