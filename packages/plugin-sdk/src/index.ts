import type { PluginCapability, PluginSurfaceRegistry, ResourceLifecycleHooks } from "./hooks";

export type * from "./hooks";

export type PluginRegistrationContext<Config extends Record<string, unknown> = Record<string, unknown>> = {
  readonly pluginId: string;
  readonly config: Config;
  readonly trustMode: "trusted" | "sandboxed";
  readonly capabilities: PluginCapability[];
  /**
   * Register server-only lifecycle hooks for a resource. Multiple plugins (and core code) stack in load order.
   * Use `{ replace: true }` only when a plugin must fully override prior hooks for that resource.
   */
  registerResourceHooks: (
    resourceName: string,
    hooks: ResourceLifecycleHooks,
    options?: { replace?: boolean }
  ) => void;
  registerSurface: (surface: PluginSurfaceRegistry) => void;
};

/** Published plugins should export this (named `openAdminPlugin` or default). */
export type OpenAdminPlugin<Config extends Record<string, unknown> = Record<string, unknown>> = {
  /** Stable id, e.g. reverse-DNS `com.vendor.billing` */
  id: string;
  displayName?: string;
  version: string;
  /** Reserved for marketplace / license flows */
  marketplace?: {
    listingUrl?: string;
    productId?: string;
    licenseKey?: string;
  };
  register: (ctx: PluginRegistrationContext<Config>) => void | Promise<void>;
  onStart?: (ctx: PluginRegistrationContext<Config>) => void | Promise<void>;
  onShutdown?: (ctx: PluginRegistrationContext<Config>) => void | Promise<void>;
};

export type OpenAdminPluginModule<Config extends Record<string, unknown> = Record<string, unknown>> = {
  openAdminPlugin?: OpenAdminPlugin<Config>;
  default?: OpenAdminPlugin<Config>;
};
