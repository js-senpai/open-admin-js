import type { PrismaClient } from "@prisma/client";
import { defineResource } from "@openadminjs/core";

export const productsResource = defineResource({
  name: "products",
  label: { en: "Products", ru: "Товары" },
  model: "product",
  titleField: "name",
  icon: "ShoppingBag",
  i18n: { defaultLocale: "en", locales: ["en", "ru"] },
  permissions: {
    read: "products.read",
    create: "products.create",
    update: "products.update",
    delete: "products.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: { en: "Name", ru: "Название" }, required: true, searchable: true, maxLength: 200 },
    slug: { type: "slug", label: "Slug", required: true, maxLength: 200 },
    description: { type: "textarea", label: { en: "Description", ru: "Описание" }, list: false },
    price: {
      type: "number",
      label: { en: "Price (cents)", ru: "Цена (копейки)" },
      required: true,
      min: 0,
      filterable: true,
      sortable: true
    },
    currency: {
      type: "select",
      label: "Currency",
      options: ["USD", "EUR", "GBP", "RUB", "UAH"],
      required: true
    },
    active: { type: "boolean", label: { en: "Active", ru: "Активен" }, filterable: true, sortable: true },
    imageUrl: { type: "url", label: { en: "Image URL", ru: "URL изображения" }, list: false },
    metadata: { type: "json", label: "Metadata", list: false },
    createdAt: { type: "datetime", label: { en: "Created", ru: "Создан" }, create: false, edit: false, sortable: true }
  }
});

export const ordersResource = defineResource({
  name: "orders",
  label: { en: "Orders", ru: "Заказы" },
  model: "order",
  titleField: "id",
  icon: "Receipt",
  i18n: { defaultLocale: "en", locales: ["en", "ru"] },
  permissions: {
    read: "orders.read",
    update: "orders.update",
    refund: "orders.refund"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false },
    email: { type: "email", label: { en: "Email", ru: "Email" }, searchable: true, edit: false },
    status: {
      type: "badge",
      label: { en: "Status", ru: "Статус" },
      options: ["pending", "paid", "failed", "refunded", "cancelled"],
      filterable: true,
      sortable: true
    },
    total: { type: "number", label: { en: "Total (cents)", ru: "Итог (копейки)" }, edit: false, sortable: true, filterable: true },
    currency: { type: "text", label: "Currency", edit: false },
    notes: { type: "textarea", label: { en: "Notes", ru: "Заметки" }, list: false },
    createdAt: { type: "datetime", label: { en: "Created", ru: "Создан" }, create: false, edit: false, sortable: true }
  },
  actions: {
    refund: {
      label: { en: "Refund", ru: "Возврат" },
      variant: "destructive",
      confirm: true,
      permission: "orders.refund",
      async handler(ctx) {
        const db = ctx.prisma as PrismaClient;
        const order = await db.order.findUnique({
          where: { id: ctx.id },
          include: { transactions: true }
        });
        if (!order || order.status !== "paid") {
          throw new Error("Order is not paid or not found");
        }
        return db.order.update({ where: { id: ctx.id }, data: { status: "refunded" } });
      }
    },
    cancel: {
      label: { en: "Cancel", ru: "Отменить" },
      variant: "destructive",
      confirm: true,
      permission: "orders.update",
      async handler(ctx) {
        const db = ctx.prisma as PrismaClient;
        return db.order.update({
          where: { id: ctx.id },
          data: { status: "cancelled" }
        });
      }
    }
  }
});

export const transactionsResource = defineResource({
  name: "transactions",
  label: { en: "Transactions", ru: "Транзакции" },
  model: "transaction",
  titleField: "id",
  icon: "CreditCard",
  i18n: { defaultLocale: "en", locales: ["en", "ru"] },
  permissions: {
    read: "transactions.read"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false },
    provider: { type: "badge", label: { en: "Provider", ru: "Провайдер" }, create: false, edit: false, filterable: true },
    providerTxId: { type: "text", label: { en: "Provider TX ID", ru: "ID транзакции" }, create: false, edit: false },
    status: {
      type: "badge",
      label: { en: "Status", ru: "Статус" },
      options: ["pending", "succeeded", "failed", "refunded"],
      create: false,
      edit: false,
      filterable: true,
      sortable: true
    },
    amount: { type: "number", label: { en: "Amount (cents)", ru: "Сумма (копейки)" }, create: false, edit: false, sortable: true },
    currency: { type: "text", label: "Currency", create: false, edit: false },
    createdAt: { type: "datetime", label: { en: "Created", ru: "Создан" }, create: false, edit: false, sortable: true }
  }
});

export const webhookLogsResource = defineResource({
  name: "webhook-logs",
  label: { en: "Webhook Logs", ru: "Вебхук Логи" },
  model: "webhookLog",
  titleField: "eventType",
  icon: "Webhook",
  permissions: {
    read: "webhook-logs.read"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    provider: { type: "badge", label: "Provider", create: false, edit: false, filterable: true },
    eventType: { type: "text", label: { en: "Event Type", ru: "Тип события" }, create: false, edit: false, searchable: true },
    status: {
      type: "badge",
      label: "Status",
      options: ["pending", "processed", "failed"],
      create: false,
      edit: false,
      filterable: true
    },
    error: { type: "textarea", label: "Error", create: false, edit: false, list: false },
    createdAt: { type: "datetime", label: { en: "Received", ru: "Получен" }, create: false, edit: false, sortable: true }
  }
});
