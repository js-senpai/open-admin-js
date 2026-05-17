import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import { QueueService } from "./queue.service";

const originalRedisUrl = process.env.REDIS_URL;

describe("QueueService", () => {
  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl;
  });

  it("degrades gracefully when Redis is not configured", async () => {
    delete process.env.REDIS_URL;
    const recent = [{ id: "job_1", name: "maintenance.sync", status: "completed" }];
    const service = new QueueService({
      jobLog: {
        findMany: async () => recent
      }
    } as never);

    await expect(service.getStats()).resolves.toEqual({
      counts: {
        active: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      },
      recent
    });
    await expect(service.dispatch("user_1")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
