import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";
import { helloBundledPlugin } from "./hello.plugin";

/** First-party plugins shipped inside the API package (no separate npm install). */
export const bundledOpenAdminPlugins: Record<string, OpenAdminPlugin> = {
  hello: helloBundledPlugin
};
