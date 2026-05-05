import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "orders",
  label: "Orders",
  model: "order",
  titleField: "id",
  icon: "Receipt",
  permissions: {
    read: "orders.read",
    create: "orders.create",
    update: "orders.update",
    delete: "orders.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: true },
    status: {
      type: "select",
      label: "Status",
      options: ["pending", "paid", "shipped", "cancelled"],
      filterable: true,
      sortable: true
    },
    customerId: { type: "relation", label: "Customer", resource: "customers", displayField: "email", filterable: true },
    createdAt: { type: "datetime", label: "Placed", create: false, edit: false, sortable: true }
  }
});
