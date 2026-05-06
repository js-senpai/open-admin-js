import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "tags",
  label: "Tags",
  model: "tag",
  titleField: "name",
  icon: "Tag",
  permissions: {
    read: "tags.read",
    create: "tags.create",
    update: "tags.update",
    delete: "tags.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Name", required: true, searchable: true, sortable: true },
    slug: { type: "slug", label: "Slug", from: "name", searchable: true }
  }
});
