import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "tickets",
  label: "Tickets",
  model: "ticket",
  titleField: "subject",
  icon: "LifeBuoy",
  permissions: {
    read: "tickets.read",
    create: "tickets.create",
    update: "tickets.update",
    delete: "tickets.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    subject: { type: "text", label: "Subject", required: true, searchable: true, sortable: true },
    status: {
      type: "select",
      label: "Status",
      options: ["open", "pending", "resolved", "closed"],
      filterable: true,
      sortable: true
    },
    priority: {
      type: "select",
      label: "Priority",
      options: ["low", "normal", "high", "urgent"],
      filterable: true,
      sortable: true
    },
    createdAt: { type: "datetime", label: "Opened", create: false, edit: false, sortable: true },
    updatedAt: { type: "datetime", label: "Updated", create: false, edit: false, sortable: true }
  }
});
