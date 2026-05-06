import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

type Period = "7d" | "30d" | "90d";
type UserContext = { id: string; permissions: string[] };

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: UserContext, period: Period = "30d") {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);

    const [usersTotal, postsTotal, publishedPosts, filesTotal, recentPosts, recentUsers, jobsRecent, recentActivity, health] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.post.count({ where: { status: "published" } }),
      this.prisma.fileAsset.count(),
      this.prisma.post.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, status: true } }),
      this.prisma.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
      this.prisma.jobLog.findMany({ where: { createdAt: { gte: from } }, select: { status: true } }),
      this.prisma.auditLog.findMany({
        take: 15,
        orderBy: { createdAt: "desc" },
        select: { id: true, action: true, resource: true, resourceId: true, createdAt: true, user: { select: { email: true, name: true } } }
      }),
      this.health()
    ]);

    const revenueData = this.buildTimeSeries(period, recentPosts, recentUsers);
    const trafficChannels = this.buildTrafficChannels(recentPosts, recentUsers);
    const crmPipeline = this.buildCrmPipeline(recentPosts);
    const ecommerceRevenue = this.buildEcommerceRevenue(revenueData);
    const marketingMix = this.buildMarketingMix(trafficChannels);
    const conversion = this.buildConversion(recentUsers, publishedPosts);

    return {
      metrics: {
        usersTotal,
        postsTotal,
        publishedPosts,
        filesTotal
      },
      charts: {
        revenue: revenueData,
        trafficChannels,
        conversion,
        crmPipeline,
        ecommerceRevenue,
        marketingMix
      },
      jobs: this.buildJobStats(jobsRecent),
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        createdAt: entry.createdAt,
        user: entry.user ? (entry.user.name ?? entry.user.email ?? "system") : "system"
      })),
      health
    };
  }

  private buildTimeSeries(period: Period, posts: Array<{ createdAt: Date; status: string }>, users: Array<{ createdAt: Date }>) {
    const bucketCount = period === "7d" ? 7 : period === "30d" ? 4 : 3;
    const labels = period === "7d" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : period === "30d" ? ["W1", "W2", "W3", "W4"] : ["M1", "M2", "M3"];
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({ name: labels[index] ?? `P${index + 1}`, revenue: 0, signups: 0 }));

    for (const user of users) {
      const index = this.bucketIndex(user.createdAt, bucketCount);
      const bucket = buckets[index];
      if (!bucket) continue;
      bucket.signups += 1;
    }

    for (const post of posts) {
      const index = this.bucketIndex(post.createdAt, bucketCount);
      const multiplier = post.status === "published" ? 12 : 6;
      const bucket = buckets[index];
      if (!bucket) continue;
      bucket.revenue += multiplier;
    }

    return buckets.map((bucket) => ({ ...bucket, revenue: Math.max(bucket.revenue, bucket.signups * 4) }));
  }

  private buildTrafficChannels(posts: Array<{ status: string }>, users: Array<{ createdAt: Date }>) {
    const base = Math.max(users.length, 1);
    const organic = Math.min(55, 30 + Math.round((posts.filter((post) => post.status === "published").length / base) * 100));
    const paid = 25;
    const referral = 12;
    const direct = Math.max(8, 100 - organic - paid - referral);
    return [
      { label: "Organic", value: organic, color: "bg-[#7B8CFF]" },
      { label: "Paid", value: paid, color: "bg-[#20D2C2]" },
      { label: "Referral", value: referral, color: "bg-[#7A5AF8]" },
      { label: "Direct", value: direct, color: "bg-[#98A2B3]" }
    ];
  }

  private buildCrmPipeline(posts: Array<{ status: string }>) {
    const total = Math.max(posts.length, 8);
    return [
      { stage: "New", value: total },
      { stage: "Qualified", value: Math.max(Math.round(total * 0.68), 1) },
      { stage: "Proposal", value: Math.max(Math.round(total * 0.42), 1) },
      { stage: "Won", value: Math.max(posts.filter((post) => post.status === "published").length, 1) }
    ];
  }

  private buildEcommerceRevenue(revenueData: Array<{ name: string; revenue: number }>) {
    return revenueData.map((point) => ({ month: point.name, value: point.revenue }));
  }

  private buildMarketingMix(channels: Array<{ label: string; value: number }>) {
    return channels.map((channel) => ({
      name: channel.label,
      value: channel.value,
      color: channel.label === "Organic" ? "#7B8CFF" : channel.label === "Paid" ? "#20D2C2" : channel.label === "Referral" ? "#7A5AF8" : "#98A2B3"
    }));
  }

  private buildConversion(users: Array<{ createdAt: Date }>, publishedPosts: number) {
    const visits = Math.max(users.length * 20, 100);
    const signups = Math.max(users.length, 1);
    const trials = Math.max(Math.round(signups * 0.55), 1);
    const paid = Math.max(Math.min(publishedPosts, trials), 1);
    return [
      { label: "Visits", value: visits, percent: 100 },
      { label: "Signups", value: signups, percent: Math.max(Math.round((signups / visits) * 100), 1) },
      { label: "Trials", value: trials, percent: Math.max(Math.round((trials / visits) * 100), 1) },
      { label: "Paid", value: paid, percent: Math.max(Math.round((paid / visits) * 100), 1) }
    ];
  }

  private buildJobStats(rows: Array<{ status: string }>) {
    return rows.reduce(
      (acc, row) => {
        if (row.status === "completed") acc.completed += 1;
        else if (row.status === "failed") acc.failed += 1;
        else if (row.status === "processing") acc.processing += 1;
        else acc.queued += 1;
        return acc;
      },
      { queued: 0, processing: 0, completed: 0, failed: 0 }
    );
  }

  private bucketIndex(date: Date, bucketCount: number) {
    const day = date.getDay();
    return bucketCount === 7 ? (day + 6) % 7 : Math.min(Math.floor(((date.getDate() - 1) / 31) * bucketCount), bucketCount - 1);
  }

  private async health() {
    const db = await this.prisma.$queryRaw`SELECT 1`;
    void db;
    return { api: "ok", db: "ok", redis: process.env.REDIS_URL ? "configured" : "unavailable" };
  }
}
