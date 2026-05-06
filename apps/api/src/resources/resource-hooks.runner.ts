import type { ResourceConfig } from "@openadminjs/core";
import type { ResourceHookUser } from "./resource-hooks.registry";
import { getResourceHookChain } from "./resource-hooks.registry";

export async function runBeforeCreate(
  resourceName: string,
  resource: ResourceConfig,
  user: ResourceHookUser,
  prisma: unknown,
  data: Record<string, unknown>
): Promise<void> {
  const ctx = { resource, resourceName, user, prisma, data };
  for (const { hooks } of getResourceHookChain(resourceName)) {
    await hooks.beforeCreate?.(ctx);
  }
}

export async function runAfterCreate(
  resourceName: string,
  resource: ResourceConfig,
  user: ResourceHookUser,
  prisma: unknown,
  data: Record<string, unknown>,
  record: unknown
): Promise<void> {
  const ctx = { resource, resourceName, user, prisma, data, record };
  for (const { hooks } of getResourceHookChain(resourceName)) {
    await hooks.afterCreate?.(ctx);
  }
}

export async function runBeforeUpdate(
  resourceName: string,
  resource: ResourceConfig,
  user: ResourceHookUser,
  prisma: unknown,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const ctx = { resource, resourceName, user, prisma, id, data };
  for (const { hooks } of getResourceHookChain(resourceName)) {
    await hooks.beforeUpdate?.(ctx);
  }
}

export async function runAfterUpdate(
  resourceName: string,
  resource: ResourceConfig,
  user: ResourceHookUser,
  prisma: unknown,
  id: string,
  data: Record<string, unknown>,
  before: unknown,
  record: unknown
): Promise<void> {
  const ctx = { resource, resourceName, user, prisma, id, data, before, record };
  for (const { hooks } of getResourceHookChain(resourceName)) {
    await hooks.afterUpdate?.(ctx);
  }
}

export async function runBeforeDelete(
  resourceName: string,
  resource: ResourceConfig,
  user: ResourceHookUser,
  prisma: unknown,
  id: string
): Promise<void> {
  const ctx = { resource, resourceName, user, prisma, id };
  for (const { hooks } of getResourceHookChain(resourceName)) {
    await hooks.beforeDelete?.(ctx);
  }
}

export async function runAfterDelete(
  resourceName: string,
  resource: ResourceConfig,
  user: ResourceHookUser,
  prisma: unknown,
  id: string
): Promise<void> {
  const ctx = { resource, resourceName, user, prisma, id };
  for (const { hooks } of getResourceHookChain(resourceName)) {
    await hooks.afterDelete?.(ctx);
  }
}
