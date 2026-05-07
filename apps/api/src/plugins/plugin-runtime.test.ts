import { describe, expect, it } from "vitest";
import { pluginRuntime } from "./plugin-runtime";

describe("pluginRuntime", () => {
  it("registers and removes surfaces by source", () => {
    pluginRuntime.register(
      "test.plugin",
      {
        seo: {
          metadata: () => ({ title: "x" })
        },
        jobs: [{ name: "test-job", handler: () => "ok" }]
      },
      "posts"
    );
    expect(pluginRuntime.getSeoHooks().length).toBeGreaterThan(0);
    expect(pluginRuntime.getJobs().some((job) => job.name === "test-job")).toBe(true);

    pluginRuntime.removeBySource("test.plugin");

    expect(pluginRuntime.getSeoHooks().length).toBe(0);
    expect(pluginRuntime.getJobs().some((job) => job.name === "test-job")).toBe(false);
  });
});
