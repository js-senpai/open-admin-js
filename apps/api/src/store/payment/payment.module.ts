import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuthModule } from "../../auth/auth.module";
import { PaymentProviderService } from "./payment.provider";
import { PaymentService } from "./payment.service";
import { PaymentController } from "./payment.controller";

@Module({
  imports: [AuthModule],
  controllers: [PaymentController],
  providers: [PrismaService, PaymentProviderService, PaymentService],
  exports: [PaymentService, PaymentProviderService]
})
export class PaymentModule {}
