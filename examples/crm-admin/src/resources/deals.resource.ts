import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "deals",
  label: "Deals",
  model: "deal",
  titleField: "title",
  icon: "Handshake",
  permissions: {
    read: "deals.read",
    create: "deals.create",
    update: "deals.update",
    delete: "deals.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    title: { type: "text", label: "Title", required: true, searchable: true, sortable: true },
    stage: {
      type: "select",
      label: "Stage",
      options: ["lead", "qualified", "proposal", "won", "lost"],
      filterable: true,
      sortable: true
    },
    amount: { type: "money", label: "Amount", sortable: true },
    companyId: { type: "relation", label: "Company", resource: "companies", displayField: "name", filterable: true },
    contactId: { type: "relation", label: "Contact", resource: "contacts", displayField: "email", filterable: true },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
