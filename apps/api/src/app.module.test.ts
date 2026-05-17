import { describe, expect, it } from "vitest";
import { throttleIpTracker } from "./app.module";

describe("app throttling", () => {
  it("handles GraphQL requests without an HTTP request object", () => {
    expect(throttleIpTracker(undefined)).toBe("unknown");
  });

  it("uses the request IP for HTTP requests", () => {
    expect(throttleIpTracker({ ip: "127.0.0.1" })).toBe("127.0.0.1");
  });
});
