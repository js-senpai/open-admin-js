import type { RoleBlueprint } from "@openadminjs/permissions";

/**
 * Storefront / public API permission slugs (separate namespace from admin resource introspection).
 * Extend this list freely; seed syncs rows into `Permission` and assigns them to `public` realm roles.
 */
export const publicPermissionCatalog = [
  { name: "public.session.read", label: { en: "Read own session", ru: "Сессия (чтение)" } },
  { name: "public.account.read", label: { en: "Read own profile", ru: "Профиль (чтение)" } },
  { name: "public.account.update", label: { en: "Update own profile", ru: "Профиль (изменение)" } },
  { name: "public.orders.read_own", label: { en: "Read own orders", ru: "Свои заказы" } },
  { name: "public.orders.create", label: { en: "Place orders", ru: "Оформление заказов" } }
] as const;

/** Blueprints for `Role.realm === "public"` (inherits only within this realm). */
export const publicRoleBlueprints = [
  {
    name: "guest",
    realm: "public",
    label: { en: "Guest", ru: "Гость" }
  },
  {
    name: "member",
    realm: "public",
    label: { en: "Member", ru: "Участник" },
    permissions: ["public.session.read", "public.account.read", "public.account.update", "public.orders.read_own", "public.orders.create"]
  }
] as const satisfies readonly RoleBlueprint[];
