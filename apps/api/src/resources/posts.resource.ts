import type { PrismaClient } from "@prisma/client";
import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "posts",
  label: { en: "Posts", ru: "Записи" },
  model: "post",
  titleField: "title",
  icon: "FileText",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ru"]
  },
  seo: {
    public: true,
    slugField: "slug",
    pathPattern: "/posts/:slug",
    titleField: "title",
    descriptionField: "content",
    alternateSlugFields: { ru: "slug" }
  },
  permissions: {
    read: "posts.read",
    create: "posts.create",
    update: "posts.update",
    delete: "posts.delete",
    publish: "posts.publish"
  },
  fields: {
    id: { type: "id", label: { en: "ID", ru: "ID" }, create: false, edit: false, list: false },
    title: {
      type: "text",
      label: { en: "Title", ru: "Заголовок" },
      required: true,
      searchable: true,
      sortable: true
    },
    slug: {
      type: "slug",
      label: { en: "Slug", ru: "Слаг" },
      from: "title",
      searchable: true
    },
    status: {
      type: "select",
      label: { en: "Status", ru: "Статус" },
      options: ["draft", "published", "archived"],
      filterable: true,
      sortable: true
    },
    content: { type: "richtext", label: { en: "Content", ru: "Текст" }, list: false },
    categoryId: {
      type: "relation",
      label: { en: "Category", ru: "Категория" },
      resource: "categories",
      displayField: "name",
      filterable: true
    },
    coverImageId: {
      type: "image",
      label: { en: "Cover image", ru: "Обложка" },
      resource: "files",
      list: false
    },
    createdAt: {
      type: "datetime",
      label: { en: "Created at", ru: "Создано" },
      create: false,
      edit: false,
      sortable: true
    }
  },
  actions: {
    publish: {
      label: { en: "Publish", ru: "Опубликовать" },
      variant: "primary",
      confirm: true,
      permission: "posts.publish",
      async handler(ctx) {
        const db = ctx.prisma as PrismaClient;
        return db.post.update({
          where: { id: ctx.id },
          data: { status: "published" }
        });
      }
    }
  }
});
