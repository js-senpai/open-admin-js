import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../common/prisma.service";
import { StoreController } from "./store.controller";
import { PaymentModule } from "./payment/payment.module";

@Module({
  imports: [AuthModule, PaymentModule],
  controllers: [StoreController],
  providers: [PrismaService]
})
export class StoreModule {}
