import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "listings",
  label: "Listings",
  model: "listing",
  titleField: "title",
  icon: "LayoutGrid",
  permissions: {
    read: "listings.read",
    create: "listings.create",
    update: "listings.update",
    delete: "listings.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    title: { type: "text", label: "Title", required: true, searchable: true, sortable: true },
    status: {
      type: "select",
      label: "Status",
      options: ["draft", "live", "sold", "removed"],
      filterable: true,
      sortable: true
    },
    priceCents: { type: "number", label: "Price (cents)", sortable: true },
    sellerId: { type: "relation", label: "Seller", resource: "sellers", displayField: "name", filterable: true },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
