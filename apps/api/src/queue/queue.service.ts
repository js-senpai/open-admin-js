import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { PrismaService } from "../common/prisma.service";

const QUEUE_NAME = "default";

function redisConnection(): ConnectionOptions | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url ? { url } : undefined;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = redisConnection();
  private readonly queue = this.connection ? new Queue(QUEUE_NAME, { connection: this.connection }) : undefined;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async getStats() {
    const [counts, recent] = await Promise.all([
      this.queue?.getJobCounts("active", "waiting", "completed", "failed", "delayed") ?? {
        active: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      },
      this.prisma.jobLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
    ]);

    return { counts, recent };
  }

  async dispatch(userId: string) {
    const queue = this.ensureRedisConfigured();
    const payload = { initiatedBy: userId, at: new Date().toISOString() };
    const job = await queue.add("maintenance.sync", payload, {
      removeOnComplete: 100,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 }
    });

    await this.prisma.jobLog.create({
      data: {
        name: "maintenance.sync",
        status: "queued",
        payload: { ...payload, queueJobId: job.id }
      }
    });

    return { id: job.id, name: job.name };
  }

  private ensureRedisConfigured(): Queue {
    if (!this.queue) {
      throw new ServiceUnavailableException({
        message: "Redis is not configured. Set REDIS_URL to enable queues.",
        code: "REDIS_NOT_CONFIGURED"
      });
    }
    return this.queue;
  }
}
