import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createMailDriver,
  type MailDriver,
  type MailMessage,
  type SentInfo
} from "@openadminjs/mail";

/**
 * NestJS wrapper around @openadminjs/mail.
 *
 * Configure via env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_NAME
 * If SMTP_HOST is not set → uses MockMailDriver (logs to console in dev).
 */
@Injectable()
export class MailService {
  private readonly driver: MailDriver;
  private readonly logger = new Logger(MailService.name);
  private readonly appName: string;
  private readonly appUrl: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    this.appName = this.config.get<string>("APP_NAME") ?? "OpenAdminJS";
    this.appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";

    this.driver = createMailDriver(
      host
        ? {
            host,
            port: Number(this.config.get<string>("SMTP_PORT") ?? "587"),
            secure: this.config.get<string>("SMTP_SECURE") === "true",
            auth:
              this.config.get<string>("SMTP_USER")
                ? {
                    user: this.config.get<string>("SMTP_USER")!,
                    pass: this.config.get<string>("SMTP_PASS") ?? ""
                  }
                : undefined,
            from: this.config.get<string>("SMTP_FROM"),
            appName: this.appName
          }
        : undefined
    );
    this.logger.log(`Mail driver: ${host ? `smtp(${host})` : "mock"}`);
  }

  async send(message: MailMessage): Promise<SentInfo> {
    return this.driver.send({
      ...message,
      data: { appName: this.appName, appUrl: this.appUrl, ...(message.data ?? {}) }
    });
  }

  async sendWelcome(to: string, name: string) {
    return this.send({
      to,
      subject: `Welcome to ${this.appName}!`,
      template: "welcome",
      data: { name, loginUrl: `${this.appUrl}/login` }
    });
  }

  async sendPasswordReset(to: string, name: string, token: string) {
    return this.send({
      to,
      subject: `Reset your ${this.appName} password`,
      template: "password-reset",
      data: {
        name,
        resetUrl: `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
        expiresIn: "1 hour"
      }
    });
  }

  async sendEmailVerification(to: string, name: string, token: string) {
    return this.send({
      to,
      subject: `Verify your email address`,
      template: "email-verification",
      data: {
        name,
        verifyUrl: `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`,
        expiresIn: "24 hours"
      }
    });
  }

  async sendOrderConfirmation(to: string, customerName: string, orderId: string, total: number, currency: string) {
    return this.send({
      to,
      subject: `Order confirmation #${orderId}`,
      template: "order-confirmation",
      data: {
        customerName,
        orderId,
        currency,
        totalDisplay: (total / 100).toFixed(2),
        orderUrl: `${this.appUrl}/orders/${orderId}`
      }
    });
  }

  async sendRefundNotification(to: string, customerName: string, orderId: string, total: number, currency: string) {
    return this.send({
      to,
      subject: `Refund processed for order #${orderId}`,
      template: "order-refunded",
      data: { customerName, orderId, currency, totalDisplay: (total / 100).toFixed(2) }
    });
  }
}
