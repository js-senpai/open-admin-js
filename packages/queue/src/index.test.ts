import { describe, expect, it, vi } from "vitest";
import type { JobPayload, QueueDriver } from "./index";

describe("queue types", () => {
  it("dispatch returns job id", async () => {
    const driver: QueueDriver = {
      dispatch: vi.fn(async () => "job-1")
    };
    const id = await driver.dispatch("notify", { userId: "1" } satisfies JobPayload);
    expect(id).toBe("job-1");
  });
});
