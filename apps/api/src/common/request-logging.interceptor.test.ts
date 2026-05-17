import { CallHandler, ExecutionContext } from "@nestjs/common";
import { throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AppLoggerService } from "./app-logger.service";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";

function httpContext(): ExecutionContext {
  return {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => ({ method: "POST", url: "/auth/login", ip: "127.0.0.1" }),
      getResponse: () => ({ statusCode: 200 })
    })
  } as ExecutionContext;
}

describe("RequestLoggingInterceptor", () => {
  it("logs failed requests without throwing when the handler errors", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn()
    } as unknown as AppLoggerService;
    const interceptor = new RequestLoggingInterceptor(logger);

    const handler: CallHandler = {
      handle: () => throwError(() => new Error("db down"))
    };

    await expect(interceptor.intercept(httpContext(), handler).toPromise()).rejects.toThrow("db down");
    expect(logger.error).toHaveBeenCalledWith(
      "request.failed",
      expect.objectContaining({
        method: "POST",
        path: "/auth/login",
        errorMessage: "db down"
      })
    );
  });
});
