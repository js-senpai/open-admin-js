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
