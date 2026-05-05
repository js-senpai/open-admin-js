import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "companies",
  label: "Companies",
  model: "company",
  titleField: "name",
  icon: "Building2",
  permissions: {
    read: "companies.read",
    create: "companies.create",
    update: "companies.update",
    delete: "companies.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Name", required: true, searchable: true, sortable: true },
    website: { type: "url", label: "Website", list: false },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
