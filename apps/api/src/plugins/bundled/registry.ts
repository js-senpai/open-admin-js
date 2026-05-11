import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";
import { adminWidgetBundledPlugin } from "./admin-widget.plugin";
import { helloBundledPlugin } from "./hello.plugin";
import { imageOptimizerBundledPlugin } from "./image-optimizer.plugin";
import { seoBundledPlugin } from "./seo.plugin";
import { webhookBundledPlugin } from "./webhook.plugin";

/** First-party plugins shipped inside the API package (no separate npm install). */
export const bundledOpenAdminPlugins: Record<string, OpenAdminPlugin> = {
  hello: helloBundledPlugin,
  seo: seoBundledPlugin,
  "image-optimizer": imageOptimizerBundledPlugin,
  "admin-widget": adminWidgetBundledPlugin,
  webhook: webhookBundledPlugin
};
