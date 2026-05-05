import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "customers",
  label: "Customers",
  model: "customer",
  titleField: "email",
  icon: "ShoppingBag",
  permissions: {
    read: "customers.read",
    create: "customers.create",
    update: "customers.update",
    delete: "customers.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    email: { type: "email", label: "Email", required: true, searchable: true, sortable: true },
    name: { type: "text", label: "Name", searchable: true },
    createdAt: { type: "datetime", label: "Joined", create: false, edit: false, sortable: true }
  }
});
