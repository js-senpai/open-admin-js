import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "authors",
  label: "Authors",
  model: "author",
  titleField: "name",
  icon: "PenLine",
  permissions: {
    read: "authors.read",
    create: "authors.create",
    update: "authors.update",
    delete: "authors.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Name", required: true, searchable: true, sortable: true },
    slug: { type: "slug", label: "Slug", from: "name", searchable: true },
    bio: { type: "textarea", label: "Bio", list: false }
  }
});
