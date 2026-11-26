import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

type Period = "7d" | "30d" | "90d";
type UserContext = { id: string; permissions: string[] };

@Injectable()
export class AdminAnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview(user: UserContext, period: Period = "30d") {
    const has = (permission: string) => user.permissions.includes("*") || user.permissions.includes(permission);
    const from = new Date(Date.now() - (period === "7d" ? 7 : period === "90d" ? 90 : 30) * 86400000);
    const [usersTotal, postsTotal, publishedPosts, filesTotal, recentActivity] = await Promise.all([
      has("users.read") ? this.prisma.user.count() : null,
      has("posts.read") ? this.prisma.post.count() : null,
      has("posts.read") ? this.prisma.post.count({ where: { status: "published" } }) : null,
      has("files.read") ? this.prisma.fileAsset.count() : null,
      has("audit-logs.read") ? this.prisma.auditLog.findMany({
        where: { createdAt: { gte: from } }, take: 15, orderBy: { createdAt: "desc" },
        select: { id: true, action: true, resource: true, createdAt: true }
      }) : []
    ]);
    return {
      metrics: { usersTotal, postsTotal, publishedPosts, filesTotal },
      recentActivity,
      period,
      // No fabricated revenue, traffic, conversion or job statistics.
      health: { api: "ok" }
    };
  }
}
