import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import { PrismaService } from "../common/prisma.service";

const QUEUE_NAME = "default";

function redisConnection(): ConnectionOptions | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url ? { url } : undefined;
}

@Injectable()
export class QueueProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueProcessor.name);
  private worker?: Worker<{ initiatedBy?: string; at?: string }, { ok: boolean }>;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
  }

  onModuleInit() {
    const connection = redisConnection();
    if (!connection) {
      this.logger.log("Redis is not configured; queue worker is disabled.");
      return;
    }
    this.worker = new Worker(QUEUE_NAME, (job) => this.process(job), { connection });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async process(job: Job<{ initiatedBy?: string; at?: string }>) {
    await this.prisma.jobLog.create({
      data: {
        name: job.name,
        status: "processing",
        payload: { queueJobId: job.id, ...job.data }
      }
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.prisma.jobLog.create({
        data: {
          name: job.name,
          status: "completed",
          payload: { queueJobId: job.id, ...job.data }
        }
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown queue error";
      await this.prisma.jobLog.create({
        data: {
          name: job.name,
          status: "failed",
          error: message,
          payload: { queueJobId: job.id, ...job.data }
        }
      });
      this.logger.error(`Job ${job.id} failed`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}
