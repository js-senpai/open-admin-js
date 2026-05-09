import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthGuard } from "../common/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { MailModule } from "../mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("JWT_SECRET")?.trim();
        if (!secret) {
          throw new Error(
            "JWT_SECRET is not set. Add it to apps/api/.env (see README). Example: JWT_SECRET=$(openssl rand -hex 32)"
          );
        }
        return { secret, signOptions: { expiresIn: "15m" } };
      }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuthGuard],
  exports: [AuthService, AuthGuard]
})
export class AuthModule {}
