import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "products",
  label: "Products",
  model: "product",
  titleField: "name",
  icon: "Package",
  permissions: {
    read: "products.read",
    create: "products.create",
    update: "products.update",
    delete: "products.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    sku: { type: "text", label: "SKU", required: true, searchable: true, sortable: true },
    name: { type: "text", label: "Name", required: true, searchable: true, sortable: true },
    priceCents: { type: "number", label: "Price (cents)", sortable: true },
    stock: { type: "number", label: "Stock", sortable: true },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
