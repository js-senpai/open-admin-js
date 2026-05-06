import { defineResource } from "@openadminjs/core";

export const filesResource = defineResource({
  name: "files",
  label: "Files",
  model: "fileAsset",
  titleField: "filename",
  icon: "Image",
  permissions: { read: "files.read", create: "files.create", delete: "files.delete" },
  fields: {
    id: { type: "id", create: false, edit: false, list: false },
    filename: { type: "text", label: "Filename", searchable: true },
    mimeType: { type: "text", label: "MIME", filterable: true },
    size: { type: "number", label: "Size" },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false }
  }
});

export const auditLogsResource = defineResource({
  name: "audit-logs",
  label: "Audit Logs",
  model: "auditLog",
  titleField: "action",
  icon: "History",
  permissions: { read: "audit-logs.read" },
  fields: {
    id: { type: "id", create: false, edit: false, list: false },
    action: { type: "badge", label: "Action", filterable: true },
    resource: { type: "text", label: "Resource", filterable: true },
    resourceId: { type: "text", label: "Resource ID", list: false },
    before: { type: "json", label: "Before", list: false },
    after: { type: "json", label: "After", list: false },
    createdAt: { type: "datetime", label: "Created", create: false, edit: false, sortable: true }
  }
});

export const settingsResource = defineResource({
  name: "settings",
  label: "Settings",
  model: "setting",
  titleField: "key",
  icon: "Settings",
  permissions: { read: "settings.read", update: "settings.update" },
  fields: {
    id: { type: "id", create: false, edit: false, list: false },
    key: { type: "text", label: "Key", searchable: true },
    group: { type: "text", label: "Group", filterable: true },
    type: { type: "select", label: "Type", options: ["string", "boolean", "number", "json", "color"] },
    value: { type: "json", label: "Value" }
  }
});
