import "./resources/resource-hooks.install";
import "./plugins/bootstrap";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./common/prisma.service";
import { LoggingModule } from "./common/logging.module";
import { RequestLoggingInterceptor } from "./common/request-logging.interceptor";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { GraphqlApiModule } from "./graphql/graphql.module";
import { HealthController } from "./health/health.controller";
import { QueueModule } from "./queue/queue.module";
import { StoreModule } from "./store/store.module";
import { MailModule } from "./mail/mail.module";
import { PluginApiInterceptor } from "./plugins/plugin-api.interceptor";

const envFilePath = [join(process.cwd(), ".env"), join(process.cwd(), "apps", "api", ".env")].filter((p) =>
  existsSync(p)
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath.length > 0 ? envFilePath : [".env"]
    }),
    LoggingModule,
    AuthModule,
    ThrottlerModule.forRootAsync({
      imports: [AuthModule],
      inject: [JwtService, ConfigService],
      useFactory: (jwt: JwtService, config: ConfigService) => [
        {
          name: "default",
          ttl: 60_000,
          limit: 100,
          getTracker: (req: { ip?: string }) => req.ip ?? "unknown"
        },
        {
          name: "perUser",
          ttl: 60_000,
          limit: Number(config.get("RATE_LIMIT_USER_PER_MIN") ?? 120),
          getTracker: async (req: { headers?: { authorization?: string }; ip?: string }) => {
            const h = req.headers?.authorization;
            const t = h?.startsWith("Bearer ") ? h.slice(7) : undefined;
            if (t) {
              try {
                const secret = config.get<string>("JWT_SECRET")?.trim();
                if (secret) {
                  const p = await jwt.verifyAsync<{ sub?: string }>(t, { secret });
                  if (p.sub) return `user:${p.sub}`;
                }
              } catch {
                /* use IP bucket for invalid JWT */
              }
            }
            return `ip:${req.ip ?? "anon"}`;
          }
        }
      ]
    }),
    GraphqlApiModule,
    MailModule,
    AdminModule,
    QueueModule,
    StoreModule
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    {
      provide: APP_INTERCEPTOR,
      useClass: PluginApiInterceptor
    }
  ],
  exports: [PrismaService]
})
export class AppModule {}
