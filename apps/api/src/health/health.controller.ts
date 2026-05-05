import { Controller, Get, Inject } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    if (!process.env.REDIS_URL) return { api: "ok", db: "ok", redis: "unavailable", reason: "REDIS_URL is not set" };

    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      const pong = await redis.ping();
      return { api: "ok", db: "ok", redis: pong === "PONG" ? "ok" : "degraded" };
    } catch {
      return { api: "ok", db: "ok", redis: "error" };
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }
}
