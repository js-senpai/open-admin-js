import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "payouts",
  label: "Payouts",
  model: "payout",
  titleField: "id",
  icon: "Banknote",
  permissions: {
    read: "payouts.read",
    create: "payouts.create",
    update: "payouts.update",
    delete: "payouts.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: true },
    amountCents: { type: "number", label: "Amount (cents)", sortable: true },
    status: {
      type: "select",
      label: "Status",
      options: ["scheduled", "processing", "paid", "failed"],
      filterable: true,
      sortable: true
    },
    sellerId: { type: "relation", label: "Seller", resource: "sellers", displayField: "name", filterable: true },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
