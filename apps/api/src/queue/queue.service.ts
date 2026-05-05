import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue("default") private readonly queue: Queue,
    private readonly prisma: PrismaService
  ) {}

  async getStats() {
    const [counts, recent] = await Promise.all([
      this.queue.getJobCounts("active", "waiting", "completed", "failed", "delayed"),
      this.prisma.jobLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
    ]);

    return { counts, recent };
  }

  async dispatch(userId: string) {
    this.ensureRedisConfigured();
    const payload = { initiatedBy: userId, at: new Date().toISOString() };
    const job = await this.queue.add("maintenance.sync", payload, {
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

  private ensureRedisConfigured() {
    if (!process.env.REDIS_URL) {
      throw new ServiceUnavailableException({
        message: "Redis is not configured. Set REDIS_URL to enable queues.",
        code: "REDIS_NOT_CONFIGURED"
      });
    }
  }
}
