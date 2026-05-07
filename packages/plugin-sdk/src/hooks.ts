import type { ResourceConfig } from "@openadminjs/core";

/** Mirrors `apps/api` resource hook user shape — keep in sync when extending auth context. */
export type ResourceHookUser = { id: string; email: string; permissions: string[] };

export type BeforeCreateCtx = {
  resource: ResourceConfig;
  resourceName: string;
  user: ResourceHookUser;
  prisma: unknown;
  data: Record<string, unknown>;
};

export type AfterCreateCtx = BeforeCreateCtx & { record: unknown };

export type BeforeUpdateCtx = {
  resource: ResourceConfig;
  resourceName: string;
  user: ResourceHookUser;
  prisma: unknown;
  id: string;
  data: Record<string, unknown>;
};

export type AfterUpdateCtx = BeforeUpdateCtx & { before: unknown; record: unknown };

export type BeforeDeleteCtx = {
  resource: ResourceConfig;
  resourceName: string;
  user: ResourceHookUser;
  prisma: unknown;
  id: string;
};

export type AfterDeleteCtx = BeforeDeleteCtx;

export type ResourceLifecycleHooks = {
  beforeCreate?: (ctx: BeforeCreateCtx) => Promise<void> | void;
  afterCreate?: (ctx: AfterCreateCtx) => Promise<void> | void;
  beforeUpdate?: (ctx: BeforeUpdateCtx) => Promise<void> | void;
  afterUpdate?: (ctx: AfterUpdateCtx) => Promise<void> | void;
  beforeDelete?: (ctx: BeforeDeleteCtx) => Promise<void> | void;
  afterDelete?: (ctx: AfterDeleteCtx) => Promise<void> | void;
};

export type ApiRouteExtension = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: (ctx: {
    body?: unknown;
    query?: Record<string, unknown>;
    params?: Record<string, string>;
    user?: ResourceHookUser;
    prisma: unknown;
  }) => Promise<unknown> | unknown;
};

export type ApiHooks = {
  beforeRequest?: (ctx: {
    method: string;
    path: string;
    body?: unknown;
    query?: Record<string, unknown>;
    user?: ResourceHookUser;
  }) => Promise<void> | void;
  afterRequest?: (ctx: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    user?: ResourceHookUser;
  }) => Promise<void> | void;
  routes?: ApiRouteExtension[];
};

export type MediaHooks = {
  beforeStore?: (ctx: {
    filename: string;
    mimeType: string;
    size: number;
    contentBase64?: string;
    user?: ResourceHookUser;
  }) => Promise<void> | void;
  transform?: (ctx: {
    filename: string;
    mimeType: string;
    contentBase64: string;
    user?: ResourceHookUser;
  }) => Promise<{ filename?: string; mimeType?: string; contentBase64: string }> | { filename?: string; mimeType?: string; contentBase64: string };
  afterStore?: (ctx: {
    fileId: string;
    filename: string;
    mimeType: string;
    size: number;
    user?: ResourceHookUser;
  }) => Promise<void> | void;
};

export type SeoHooks = {
  metadata?: (ctx: { resourceName: string; record: Record<string, unknown> }) => Promise<Record<string, unknown>> | Record<string, unknown>;
  sitemapEntry?: (ctx: { resourceName: string; record: Record<string, unknown> }) => Promise<{ url: string; lastModified?: string } | null> | { url: string; lastModified?: string } | null;
};

export type JobHandler = {
  name: string;
  handler: (ctx: { payload: unknown; user?: ResourceHookUser; prisma: unknown }) => Promise<unknown> | unknown;
};

export type AdminUiExtension = {
  kind: "menu" | "page" | "widget" | "action";
  id: string;
  title: string;
  route?: string;
  config?: Record<string, unknown>;
};

export type PluginCapability =
  | "db.read"
  | "db.write"
  | "resource.hooks"
  | "api.hooks"
  | "api.routes"
  | "media.pipeline"
  | "seo.extend"
  | "jobs.run"
  | "admin.ui.extend";

export type PluginSurfaceRegistry = {
  resource?: ResourceLifecycleHooks;
  api?: ApiHooks;
  media?: MediaHooks;
  seo?: SeoHooks;
  jobs?: JobHandler[];
  adminUi?: AdminUiExtension[];
};
