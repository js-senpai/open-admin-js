import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuthModule } from "../../auth/auth.module";
import { PaymentService } from "./payment.service";
import { PaymentController } from "./payment.controller";

@Module({
  imports: [AuthModule],
  controllers: [PaymentController],
  providers: [PrismaService, PaymentService],
  exports: [PaymentService]
})
export class PaymentModule {}
