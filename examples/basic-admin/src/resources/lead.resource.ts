import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "leads",
  label: "Leads",
  model: "lead",
  titleField: "name",
  icon: "UserPlus",
  permissions: {
    read: "leads.read",
    create: "leads.create",
    update: "leads.update",
    delete: "leads.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    name: { type: "text", label: "Name", searchable: true, sortable: true },
    email: { type: "email", label: "Email", searchable: true },
    company: { type: "text", label: "Company", searchable: true },
    status: {
      type: "select",
      label: "Status",
      options: ["new", "contacted", "qualified", "lost"],
      filterable: true,
      sortable: true
    },
    notes: { type: "textarea", label: "Notes", list: false },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
