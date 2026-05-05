import { describe, expect, it } from "vitest";
import type { NotificationMessage } from "./index";

describe("NotificationMessage", () => {
  it("accepts optional body", () => {
    const msg: NotificationMessage = { userId: "u1", title: "Hello" };
    expect(msg.body).toBeUndefined();
  });
});
