import "./resources/resource-hooks.install";
import "./plugins/bootstrap";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./common/prisma.service";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { HealthController } from "./health/health.controller";
import { QueueModule } from "./queue/queue.module";
import { StoreModule } from "./store/store.module";
import { MailModule } from "./mail/mail.module";

const envFilePath = [join(process.cwd(), ".env"), join(process.cwd(), "apps", "api", ".env")].filter((p) =>
  existsSync(p)
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath.length > 0 ? envFilePath : [".env"]
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    AdminModule,
    MailModule,
    QueueModule,
    StoreModule
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService]
})
export class AppModule {}
