import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "order-items",
  label: "Order items",
  model: "orderItem",
  titleField: "id",
  icon: "ListOrdered",
  permissions: {
    read: "order-items.read",
    create: "order-items.create",
    update: "order-items.update",
    delete: "order-items.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    orderId: { type: "relation", label: "Order", resource: "orders", displayField: "id", filterable: true },
    productId: { type: "relation", label: "Product", resource: "products", displayField: "name", filterable: true },
    quantity: { type: "number", label: "Qty", sortable: true },
    unitPriceCents: { type: "number", label: "Unit (cents)", sortable: true }
  }
});
