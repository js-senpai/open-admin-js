import { describe, expect, it, beforeEach } from "vitest";
import { runBeforeCreate } from "./resource-hooks.runner";
import {
  registerResourceHooks,
  resetResourceHookRegistryForTests,
  unregisterResourceHooksBySource
} from "./resource-hooks.registry";
import type { ResourceConfig } from "@openadminjs/core";

const stubResource = { name: "x", label: "X", model: "M", permissions: { read: "x.read", create: "x.c" }, fields: {} } as unknown as ResourceConfig;

describe("resource hook registry", () => {
  beforeEach(() => resetResourceHookRegistryForTests());

  it("stacks hooks in registration order", async () => {
    const order: string[] = [];
    registerResourceHooks("posts", {
      beforeCreate() {
        order.push("a");
      }
    });
    registerResourceHooks("posts", {
      beforeCreate() {
        order.push("b");
      }
    });
    await runBeforeCreate("posts", stubResource, { id: "1", email: "e", permissions: [] }, {}, {});
    expect(order).toEqual(["a", "b"]);
  });

  it("replace clears prior hooks for that resource", async () => {
    const order: string[] = [];
    registerResourceHooks("posts", {
      beforeCreate() {
        order.push("first");
      }
    });
    registerResourceHooks(
      "posts",
      {
        beforeCreate() {
          order.push("only");
        }
      },
      { replace: true }
    );
    await runBeforeCreate("posts", stubResource, { id: "1", email: "e", permissions: [] }, {}, {});
    expect(order).toEqual(["only"]);
  });

  it("unregisterResourceHooksBySource removes only matching source", async () => {
    const order: string[] = [];
    registerResourceHooks(
      "posts",
      { beforeCreate() { order.push("core"); } },
      { source: "core" }
    );
    registerResourceHooks(
      "posts",
      { beforeCreate() { order.push("p1"); } },
      { source: "plugin-a" }
    );
    registerResourceHooks(
      "posts",
      { beforeCreate() { order.push("p2"); } },
      { source: "plugin-b" }
    );
    unregisterResourceHooksBySource("plugin-a");
    await runBeforeCreate("posts", stubResource, { id: "1", email: "e", permissions: [] }, {}, {});
    expect(order).toEqual(["core", "p2"]);
  });
});
