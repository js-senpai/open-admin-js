import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "categories",
  label: "Categories",
  model: "category",
  titleField: "name",
  icon: "Folder",
  permissions: {
    read: "categories.read",
    create: "categories.create",
    update: "categories.update",
    delete: "categories.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Name", required: true, searchable: true, sortable: true },
    slug: { type: "slug", label: "Slug", from: "name", searchable: true },
    createdAt: { type: "datetime", label: "Created at", create: false, edit: false, sortable: true }
  }
});
