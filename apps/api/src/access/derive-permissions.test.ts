import { describe, expect, it } from "vitest";
import { defineResource } from "@openadminjs/core";
import { collectPermissionSlugsFromResources } from "./derive-permissions";

describe("collectPermissionSlugsFromResources", () => {
  it("collects resource, field, action and listScope bypass slugs", () => {
    const r = defineResource({
      name: "widgets",
      label: "Widgets",
      model: "Widget",
      permissions: { read: "widgets.read", custom: "widgets.custom" },
      listScope: { type: "userOwns", field: "ownerId", bypassPermissions: ["widgets.read.all"] },
      fields: {
        id: { type: "id", list: true },
        secret: { type: "text", list: false, permissions: { read: "widgets.secret.read" } }
      },
      actions: {
        ping: { label: "Ping", permission: "widgets.ping" }
      }
    });
    const set = collectPermissionSlugsFromResources([r]);
    expect([...set].sort()).toEqual(
      ["widgets.custom", "widgets.ping", "widgets.read", "widgets.read.all", "widgets.secret.read"].sort()
    );
  });
});
