import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "sellers",
  label: "Sellers",
  model: "seller",
  titleField: "name",
  icon: "Store",
  permissions: {
    read: "sellers.read",
    create: "sellers.create",
    update: "sellers.update",
    delete: "sellers.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Name", required: true, searchable: true, sortable: true },
    email: { type: "email", label: "Email", required: true, searchable: true },
    status: {
      type: "select",
      label: "Status",
      options: ["pending", "active", "suspended"],
      filterable: true,
      sortable: true
    },
    createdAt: { type: "datetime", label: "Joined", create: false, edit: false, sortable: true }
  }
});
