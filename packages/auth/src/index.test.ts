import { describe, expect, it } from "vitest";
import { publicAuthRoutes } from "./index";

describe("auth constants", () => {
  it("lists public auth routes", () => {
    expect(publicAuthRoutes).toContain("/auth/login");
    expect(publicAuthRoutes).toContain("/auth/password/forgot");
    expect(publicAuthRoutes).toContain("/auth/email/verify");
  });
});
