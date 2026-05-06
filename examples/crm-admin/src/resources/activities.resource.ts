import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "activities",
  label: "Activities",
  model: "activity",
  titleField: "type",
  icon: "ListTodo",
  permissions: {
    read: "activities.read",
    create: "activities.create",
    update: "activities.update",
    delete: "activities.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    type: {
      type: "select",
      label: "Type",
      options: ["call", "email", "meeting", "note"],
      filterable: true,
      sortable: true
    },
    body: { type: "textarea", label: "Details", list: false },
    dealId: { type: "relation", label: "Deal", resource: "deals", displayField: "title", filterable: true },
    contactId: { type: "relation", label: "Contact", resource: "contacts", displayField: "email", filterable: true },
    createdAt: { type: "datetime", label: "When", create: false, edit: false, sortable: true }
  }
});
