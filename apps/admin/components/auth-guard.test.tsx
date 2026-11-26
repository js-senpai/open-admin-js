// @vitest-environment jsdom
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ replace })
}));

vi.mock("../lib/api", () => ({
  api: vi.fn()
}));

describe("AuthGuard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows public login route without redirect", async () => {
    const { api } = await import("../lib/api");
    vi.mocked(api).mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    usePathname.mockReturnValue("/login");
    const { AuthGuard } = await import("./auth-guard");

    const { getByText } = render(
      <AuthGuard>
        <div>inside</div>
      </AuthGuard>
    );

    expect(getByText("inside")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to login when token is missing", async () => {
    const { api } = await import("../lib/api");
    vi.mocked(api).mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    usePathname.mockReturnValue("/dashboard");
    const { AuthGuard } = await import("./auth-guard");

    render(
      <AuthGuard>
        <div>inside</div>
      </AuthGuard>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login?next=%2Fdashboard");
    });
  });
});
