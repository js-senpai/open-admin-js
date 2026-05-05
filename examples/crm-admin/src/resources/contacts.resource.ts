import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "contacts",
  label: "Contacts",
  model: "contact",
  titleField: "firstName",
  icon: "Users",
  permissions: {
    read: "contacts.read",
    create: "contacts.create",
    update: "contacts.update",
    delete: "contacts.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    firstName: { type: "text", label: "First name", required: true, searchable: true, sortable: true },
    lastName: { type: "text", label: "Last name", searchable: true, sortable: true },
    email: { type: "email", label: "Email", searchable: true },
    phone: { type: "text", label: "Phone", searchable: true },
    companyId: { type: "relation", label: "Company", resource: "companies", displayField: "name", filterable: true },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
