import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";

/**
 * Demo bundled plugin: stacks `afterCreate` on `posts` after core hooks.
 * Enable in `plugins.manifest.json` with `{ "id": "io.openadminjs.hello", "bundled": "hello", "enabled": true }`.
 */
export const helloBundledPlugin: OpenAdminPlugin = {
  id: "io.openadminjs.hello",
  version: "0.1.0",
  displayName: "Hello (bundled demo)",
  register({ registerResourceHooks, config }) {
    const tag = typeof config.tag === "string" ? config.tag : "hello-plugin";
    registerResourceHooks("posts", {
      afterCreate() {
        void tag;
      }
    });
  }
};
