// ──────────────────────────────────────────────────────────────────────────────
// @openadminjs/mail — email abstraction layer with template engine
//
// Usage (with SMTP):
//   const mailer = new SmtpMailDriver({ host: "smtp.gmail.com", port: 587, ... });
//
// Usage (with mock for dev/tests):
//   const mailer = new MockMailDriver();
// ──────────────────────────────────────────────────────────────────────────────

export type MailAddress = string | { name: string; address: string };

export type MailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

export type MailMessage = {
  to: MailAddress | MailAddress[];
  from?: MailAddress;
  replyTo?: MailAddress;
  subject: string;
  /** Plain text body */
  text?: string;
  /** HTML body — use renderTemplate() to build from a template */
  html?: string;
  /** Template name (resolved by the registered template engine) */
  template?: string;
  /** Data passed to the template engine */
  data?: Record<string, unknown>;
  attachments?: MailAttachment[];
};

export type SentInfo = {
  messageId: string;
  accepted: MailAddress[];
};

export interface MailDriver {
  send(message: MailMessage): Promise<SentInfo>;
}

// ──────────────────────────────────────────────
// Minimal built-in template engine
// ──────────────────────────────────────────────

/**
 * Renders a template string with `{{variable}}` placeholders.
 * Supports nested keys via dot notation: `{{user.name}}`.
 */
export function renderTemplate(template: string, data: Record<string, unknown> = {}): string {
  return template.replace(/\{\{([\w.]+)}}/g, (_, key: string) => {
    const value = key.split(".").reduce<unknown>((obj, k) => {
      if (obj != null && typeof obj === "object") return (obj as Record<string, unknown>)[k];
      return undefined;
    }, data);
    return value != null ? String(value) : "";
  });
}

// ──────────────────────────────────────────────
// Built-in HTML email templates
// ──────────────────────────────────────────────

const BASE_LAYOUT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{subject}}</title>
<style>
  body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)}
  .header{background:linear-gradient(135deg,#2454ff,#0ea5a4);padding:32px 40px}
  .header h1{color:#fff;margin:0;font-size:22px;font-weight:700}
  .body{padding:32px 40px}
  .body p{color:#475569;line-height:1.7;margin:0 0 16px}
  .btn{display:inline-block;padding:12px 28px;background:#2454ff;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px}
  .footer{padding:20px 40px;background:#f8fafc;text-align:center}
  .footer p{color:#94a3b8;font-size:12px;margin:0}
  .divider{height:1px;background:#e2e8f0;margin:20px 0}
  .highlight{background:#eef3ff;border-radius:8px;padding:16px;font-family:monospace;word-break:break-all;color:#2454ff;font-size:14px}
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>{{appName}}</h1></div>
  <div class="body">{{bodyContent}}</div>
  <div class="footer"><p>© {{year}} {{appName}}. This email was sent automatically.</p></div>
</div>
</body>
</html>`;

export const EMAIL_TEMPLATES: Record<string, string> = {
  welcome: BASE_LAYOUT.replace(
    "{{bodyContent}}",
    `<p>Hi <strong>{{name}}</strong>,</p>
<p>Welcome to <strong>{{appName}}</strong>! Your account has been created successfully.</p>
<p><a href="{{loginUrl}}" class="btn">Sign in to your account</a></p>
<div class="divider"></div>
<p>If you didn't create this account, you can safely ignore this email.</p>`
  ),

  "password-reset": BASE_LAYOUT.replace(
    "{{bodyContent}}",
    `<p>Hi {{name}},</p>
<p>You requested a password reset. Click the button below to set a new password:</p>
<p><a href="{{resetUrl}}" class="btn">Reset password</a></p>
<div class="divider"></div>
<p>This link expires in <strong>{{expiresIn}}</strong>. If you didn't request a reset, ignore this email.</p>`
  ),

  "email-verification": BASE_LAYOUT.replace(
    "{{bodyContent}}",
    `<p>Hi {{name}},</p>
<p>Please verify your email address to complete your registration:</p>
<p><a href="{{verifyUrl}}" class="btn">Verify email address</a></p>
<div class="divider"></div>
<p>This link expires in <strong>{{expiresIn}}</strong>.</p>`
  ),

  "order-confirmation": BASE_LAYOUT.replace(
    "{{bodyContent}}",
    `<p>Hi {{customerName}},</p>
<p>Thank you for your order! Here's a summary:</p>
<div class="highlight">Order #{{orderId}} — {{currency}} {{totalDisplay}}</div>
<p style="margin-top:16px">You can check your order status at any time:</p>
<p><a href="{{orderUrl}}" class="btn">View order</a></p>`
  ),

  "order-refunded": BASE_LAYOUT.replace(
    "{{bodyContent}}",
    `<p>Hi {{customerName}},</p>
<p>Your refund for order <strong>#{{orderId}}</strong> has been processed.</p>
<div class="highlight">Refund amount: {{currency}} {{totalDisplay}}</div>
<p>The funds will be returned to your original payment method within 5–10 business days.</p>`
  )
};

// ──────────────────────────────────────────────
// Mock driver (dev / testing)
// ──────────────────────────────────────────────

export type SentMailRecord = MailMessage & { sentAt: Date };

export class MockMailDriver implements MailDriver {
  readonly sent: SentMailRecord[] = [];

  async send(message: MailMessage): Promise<SentInfo> {
    const resolved = this.resolve(message);
    this.sent.push({ ...resolved, sentAt: new Date() });
    return {
      messageId: `mock_${Date.now()}@localhost`,
      accepted: Array.isArray(message.to) ? message.to : [message.to]
    };
  }

  private resolve(message: MailMessage): MailMessage {
    if (message.template && EMAIL_TEMPLATES[message.template]) {
      const data = { year: new Date().getFullYear(), ...(message.data ?? {}) };
      return { ...message, html: renderTemplate(EMAIL_TEMPLATES[message.template]!, data) };
    }
    return message;
  }

  last(): SentMailRecord | undefined {
    return this.sent[this.sent.length - 1];
  }

  clear() {
    this.sent.length = 0;
  }
}

// ──────────────────────────────────────────────
// SMTP driver (nodemailer-based)
// ──────────────────────────────────────────────

export type SmtpConfig = {
  host: string;
  port: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  from?: MailAddress;
  appName?: string;
};

export class SmtpMailDriver implements MailDriver {
  private readonly config: SmtpConfig;
  // Transporter is created lazily so nodemailer is not required unless used
  private transporter: unknown = null;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  private async getTransporter() {
    if (!this.transporter) {
      const nodemailer = (await import("nodemailer")) as typeof import("nodemailer");
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure ?? this.config.port === 465,
        auth: this.config.auth
      });
    }
    return this.transporter as Awaited<ReturnType<typeof import("nodemailer").createTransport>>;
  }

  async send(message: MailMessage): Promise<SentInfo> {
    const transporter = await this.getTransporter();
    const resolved = this.resolve(message);
    const info = await transporter.sendMail({
      from: resolved.from ?? this.config.from ?? `noreply@${this.config.host}`,
      to: Array.isArray(resolved.to) ? resolved.to.join(", ") : resolved.to,
      replyTo: resolved.replyTo as string | undefined,
      subject: resolved.subject,
      text: resolved.text,
      html: resolved.html,
      attachments: resolved.attachments
    });
    return { messageId: info.messageId as string, accepted: info.accepted as MailAddress[] };
  }

  private resolve(message: MailMessage): MailMessage {
    if (message.template && EMAIL_TEMPLATES[message.template]) {
      const data: Record<string, unknown> = {
        appName: this.config.appName ?? "OpenAdminJS",
        year: new Date().getFullYear(),
        ...(message.data ?? {})
      };
      return { ...message, html: renderTemplate(EMAIL_TEMPLATES[message.template]!, data) };
    }
    return message;
  }
}

// ──────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────

export function createMailDriver(config?: SmtpConfig): MailDriver {
  if (config?.host) return new SmtpMailDriver(config);
  return new MockMailDriver();
}
