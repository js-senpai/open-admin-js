import type { ResourceConfig } from "@openadminjs/core";
import type { RoleBlueprint } from "@openadminjs/permissions";
import { resources } from "../resources/registry";
import { collectPermissionSlugsFromResources, slugToDefaultLabels } from "./derive-permissions";

/**
 * Human labels for slugs that never appear on `defineResource.permissions`
 * (wildcard, cross-cutting keys, list-scope bypass, etc.).
 */
const PERMISSION_LABEL_OVERRIDES: Record<string, { en: string; ru: string }> = {
  "*": { en: "All permissions", ru: "Все разрешения" },
  "roles.read": { en: "View roles", ru: "Просмотр ролей" },
  "notifications.read.all": { en: "View all users' notifications", ru: "Все уведомления" },
  "users.read": { en: "View users", ru: "Просмотр пользователей" },
  "posts.read": { en: "View posts", ru: "Просмотр записей" },
  "posts.create": { en: "Create posts", ru: "Создание записей" },
  "posts.update": { en: "Update posts", ru: "Изменение записей" },
  "posts.delete": { en: "Delete posts", ru: "Удаление записей" },
  "posts.publish": { en: "Publish posts", ru: "Публикация записей" },
  "categories.read": { en: "View categories", ru: "Просмотр категорий" },
  "categories.create": { en: "Create categories", ru: "Создание категорий" },
  "categories.update": { en: "Update categories", ru: "Изменение категорий" },
  "categories.delete": { en: "Delete categories", ru: "Удаление категорий" },
  "files.read": { en: "View files", ru: "Просмотр файлов" },
  "files.create": { en: "Upload files", ru: "Загрузка файлов" },
  "files.delete": { en: "Delete files", ru: "Удаление файлов" },
  "audit-logs.read": { en: "View audit logs", ru: "Аудит" },
  "settings.read": { en: "View settings", ru: "Настройки (чтение)" },
  "settings.update": { en: "Update settings", ru: "Настройки (запись)" },
  "api-tokens.read": { en: "View API tokens", ru: "Токены API" },
  "api-tokens.create": { en: "Create API tokens", ru: "Создание токенов" },
  "api-tokens.delete": { en: "Delete API tokens", ru: "Удаление токенов" },
  "api-tokens.revoke": { en: "Revoke API tokens", ru: "Отзыв токенов" },
  "notifications.read": { en: "View notifications", ru: "Уведомления" },
  "notifications.create": { en: "Create notifications", ru: "Создание уведомлений" },
  "notifications.update": { en: "Update notifications", ru: "Изменение уведомлений" },
  "notifications.delete": { en: "Delete notifications", ru: "Удаление уведомлений" },
  "jobs.read": { en: "View jobs", ru: "Задачи" },
  "jobs.dispatch": { en: "Dispatch jobs", ru: "Запуск задач" },
  "ai.chat": { en: "Use AI consultant", ru: "AI-консультант" }
};

export function buildPermissionCatalog(
  allResources: readonly ResourceConfig[],
  labelOverrides: Record<string, { en: string; ru: string }>
): { name: string; label: { en: string; ru: string } }[] {
  const slugs = collectPermissionSlugsFromResources(allResources);
  for (const key of Object.keys(labelOverrides)) {
    slugs.add(key);
  }
  return [...slugs]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      label: labelOverrides[name] ?? slugToDefaultLabels(name)
    }));
}

/** Merged from `resources[]` introspection + manual overrides (wildcard, bypass slugs, i18n copy). */
export const permissionCatalog = buildPermissionCatalog(resources, PERMISSION_LABEL_OVERRIDES);

/** Slugs passed to blueprint expansion (omit "*" — wildcard adds the rest at seed time). */
export const catalogSlugList = permissionCatalog.map((p) => p.name).filter((n) => n !== "*");

/**
 * Declarative roles: edit this file to reshape RBAC without touching seed logic.
 * - `inherits` pulls in another blueprint's permissions (DAG).
 * - `"*"` grants every slug in `catalogSlugList` plus the literal "*" (superuser).
 */
export const roleBlueprints = [
  {
    name: "viewer",
    label: { en: "Viewer", ru: "Наблюдатель" },
    permissions: ["posts.read", "categories.read", "notifications.read", "jobs.read"]
  },
  {
    name: "editor",
    label: { en: "Editor", ru: "Редактор" },
    inherits: ["viewer"],
    permissions: [
      "posts.create",
      "posts.update",
      "posts.delete",
      "posts.publish",
      "categories.create",
      "categories.update",
      "categories.delete",
      "files.read",
      "files.create",
      "files.delete",
      "users.read",
      "settings.read",
      "settings.update",
      "api-tokens.read",
      "api-tokens.create",
      "api-tokens.delete",
      "api-tokens.revoke",
      "notifications.create",
      "notifications.update",
      "notifications.delete",
      "audit-logs.read",
      "jobs.dispatch",
      "ai.chat"
    ]
  },
  {
    name: "admin",
    label: { en: "Administrator", ru: "Администратор" },
    inherits: ["editor"],
    permissions: ["*", "notifications.read.all", "roles.read"]
  }
] as const satisfies readonly RoleBlueprint[];
