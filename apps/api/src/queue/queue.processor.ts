import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma.service";

@Processor("default")
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
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
