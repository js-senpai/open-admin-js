import type { PrismaClient } from "@prisma/client";
import { defineResource } from "@openadminjs/core";

export const apiTokensResource = defineResource({
  name: "api-tokens",
  label: { en: "API tokens", ru: "API-токены" },
  model: "apiToken",
  titleField: "name",
  icon: "KeyRound",
  i18n: { defaultLocale: "en", locales: ["en", "ru"] },
  permissions: {
    read: "api-tokens.read",
    create: "api-tokens.create",
    delete: "api-tokens.delete",
    revoke: "api-tokens.revoke"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: { en: "Name", ru: "Имя" }, searchable: true },
    scopes: { type: "json", label: "Scopes", create: true, edit: false },
    tokenHash: { type: "hidden", label: "Token hash" },
    revokedAt: { type: "datetime", label: { en: "Revoked at", ru: "Отозван" }, create: false, edit: false },
    createdAt: { type: "datetime", label: { en: "Created", ru: "Создан" }, create: false, edit: false, sortable: true }
  },
  actions: {
    revoke: {
      label: { en: "Revoke", ru: "Отозвать" },
      variant: "destructive",
      confirm: true,
      permission: "api-tokens.revoke",
      async handler(ctx) {
        const db = ctx.prisma as PrismaClient;
        return db.apiToken.update({
          where: { id: ctx.id },
          data: { revokedAt: new Date() }
        });
      }
    }
  }
});

export const notificationsResource = defineResource({
  name: "notifications",
  label: { en: "Notifications", ru: "Уведомления" },
  model: "notification",
  titleField: "title",
  icon: "Bell",
  i18n: { defaultLocale: "en", locales: ["en", "ru"] },
  listScope: {
    type: "userOwns",
    field: "userId",
    bypassPermissions: ["notifications.read.all", "*"]
  },
  permissions: {
    read: "notifications.read",
    create: "notifications.create",
    update: "notifications.update",
    delete: "notifications.delete",
    markRead: "notifications.update"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    title: { type: "text", label: { en: "Title", ru: "Заголовок" }, searchable: true },
    body: { type: "textarea", label: { en: "Body", ru: "Текст" }, list: false },
    readAt: { type: "datetime", label: { en: "Read at", ru: "Прочитано" }, create: false, edit: false },
    createdAt: { type: "datetime", label: { en: "Created", ru: "Создано" }, create: false, edit: false, sortable: true }
  },
  actions: {
    "mark-read": {
      label: { en: "Mark read", ru: "Прочитано" },
      variant: "primary",
      permission: "notifications.update",
      async handler(ctx) {
        const db = ctx.prisma as PrismaClient;
        return db.notification.update({
          where: { id: ctx.id },
          data: { readAt: new Date() }
        });
      }
    },
    "mark-unread": {
      label: { en: "Mark unread", ru: "Не прочитано" },
      variant: "default",
      permission: "notifications.update",
      async handler(ctx) {
        const db = ctx.prisma as PrismaClient;
        return db.notification.update({
          where: { id: ctx.id },
          data: { readAt: null }
        });
      }
    }
  }
});

export const jobLogsResource = defineResource({
  name: "job-logs",
  label: "Job Logs",
  model: "jobLog",
  titleField: "name",
  icon: "Gauge",
  permissions: { read: "jobs.read" },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Job", searchable: true },
    status: { type: "badge", label: "Status", filterable: true },
    payload: { type: "json", label: "Payload", list: false },
    error: { type: "textarea", label: "Error", list: false },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
