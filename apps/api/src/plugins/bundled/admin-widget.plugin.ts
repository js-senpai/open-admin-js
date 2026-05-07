import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";

export const adminWidgetBundledPlugin: OpenAdminPlugin = {
  id: "io.openadminjs.admin-widget",
  version: "0.1.0",
  displayName: "Admin widget demo",
  register({ registerSurface }) {
    registerSurface({
      adminUi: [
        {
          kind: "widget",
          id: "ops-health",
          title: "Ops Health",
          config: { metric: "queueLag", severity: "info" }
        },
        {
          kind: "menu",
          id: "plugin-insights",
          title: "Plugin Insights",
          route: "/plugins/insights"
        }
      ]
    });
  }
};
