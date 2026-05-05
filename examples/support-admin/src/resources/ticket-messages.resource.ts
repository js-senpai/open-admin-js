import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "ticket-messages",
  label: "Ticket messages",
  model: "ticketMessage",
  titleField: "id",
  icon: "MessageSquare",
  permissions: {
    read: "ticket-messages.read",
    create: "ticket-messages.create",
    update: "ticket-messages.update",
    delete: "ticket-messages.delete"
  },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    ticketId: { type: "relation", label: "Ticket", resource: "tickets", displayField: "subject", filterable: true },
    body: { type: "textarea", label: "Message", required: true, list: false },
    internal: { type: "boolean", label: "Internal note", filterable: true },
    createdAt: { type: "datetime", label: "Sent", create: false, edit: false, sortable: true }
  }
});
