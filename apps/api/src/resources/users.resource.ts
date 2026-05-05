import { defineResource } from "@openadminjs/core";

export default defineResource({
  name: "users",
  label: "Users",
  model: "user",
  titleField: "email",
  icon: "Users",
  permissions: { read: "users.read" },
  fields: {
    id: { type: "id", label: "ID", create: false, edit: false, list: false },
    email: { type: "email", label: "Email", searchable: true, sortable: true },
    passwordHash: { type: "hidden", label: "Password hash" },
    name: { type: "text", label: "Name", searchable: true },
    avatarUrl: { type: "image", label: "Avatar", list: false },
    status: { type: "badge", label: "Status", filterable: true },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});
