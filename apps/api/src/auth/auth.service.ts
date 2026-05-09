import { BadRequestException, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DEFAULT_AUTH_REALM } from "@openadminjs/permissions";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { MailService } from "../mail/mail.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Optional() @Inject(MailService) private readonly mail?: MailService
  ) {}

  async login(
    email: string,
    password: string,
    meta: { ipAddress?: string; userAgent?: string },
    realm: string = DEFAULT_AUTH_REALM
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({ message: "Invalid email or password", code: "AUTH_INVALID" });
    }
    const assignments = user.roles.filter((ur) => ur.role.realm === realm);
    if (assignments.length === 0) {
      throw new UnauthorizedException({
        message: "Invalid email or password",
        code: "AUTH_REALM_DENIED"
      });
    }
    const session = await this.issueSession(user.id, realm);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "login",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        after: { realm }
      }
    });
    return {
      ...session,
      realm,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: assignments.map((item) => item.role.name),
        permissions: assignments.flatMap((item) => item.role.permissions.map((permission) => permission.permission.name))
      }
    };
  }

  async issueSession(userId: string, realm: string = DEFAULT_AUTH_REALM) {
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) }
    });
    return {
      accessToken: await this.jwt.signAsync({ sub: userId, realm }),
      refreshToken,
      expiresIn: 900
    };
  }

  async refresh(refreshToken: string, realm: string = DEFAULT_AUTH_REALM) {
    const users = await this.prisma.user.findMany({ where: { refreshTokenHash: { not: null } } });
    const user = await users.reduce<Promise<(typeof users)[number] | undefined>>(async (match, candidate) => {
      const found = await match;
      if (found) return found;
      return candidate.refreshTokenHash && (await bcrypt.compare(refreshToken, candidate.refreshTokenHash)) ? candidate : undefined;
    }, Promise.resolve(undefined));
    if (!user) throw new UnauthorizedException({ message: "Invalid refresh token", code: "REFRESH_INVALID" });
    return this.issueSession(user.id, realm);
  }

  async logout(userId: string, meta: { ipAddress?: string; userAgent?: string }) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    await this.prisma.auditLog.create({
      data: { userId, action: "logout", ipAddress: meta.ipAddress, userAgent: meta.userAgent }
    });
    return { ok: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true, message: "If the email exists, reset instructions will be sent." };

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: "password.reset.requested", resource: "auth", after: { expiresAt } }
    });

    if (this.mail) {
      await this.mail.sendPasswordReset(user.email, user.name ?? user.email, rawToken).catch(() => {
        // Don't fail the request if mail sending fails
      });
    }

    if (process.env.NODE_ENV !== "production") return { ok: true, message: "Reset token generated", token: rawToken };
    return { ok: true, message: "If the email exists, reset instructions will be sent." };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now }
      },
      include: { user: true }
    });

    if (!resetToken) throw new BadRequestException({ message: "Invalid or expired reset token", code: "RESET_TOKEN_INVALID" });

    const nextPasswordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: nextPasswordHash, refreshTokenHash: null }
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now }
      }),
      this.prisma.auditLog.create({
        data: { userId: resetToken.userId, action: "password.reset.completed", resource: "auth" }
      })
    ]);

    return { ok: true };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const verification = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now }
      }
    });
    if (!verification) throw new BadRequestException({ message: "Invalid or expired verification token", code: "VERIFY_TOKEN_INVALID" });

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: verification.id },
        data: { usedAt: now }
      }),
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { status: "active" }
      }),
      this.prisma.auditLog.create({
        data: { userId: verification.userId, action: "email.verified", resource: "auth" }
      })
    ]);

    return { ok: true };
  }

  async me(userId: string, realm: string = DEFAULT_AUTH_REALM) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!user) throw new UnauthorizedException({ message: "Invalid session", code: "AUTH_INVALID" });
    const assignments = user.roles.filter((ur) => ur.role.realm === realm);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      status: user.status,
      realm,
      roles: assignments.map((item) => item.role.name),
      permissions: assignments.flatMap((item) => item.role.permissions.map((permission) => permission.permission.name))
    };
  }

  /** All role bindings across realms (account / picker UI). */
  async membershipSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!user) throw new UnauthorizedException({ message: "Invalid session", code: "AUTH_INVALID" });
    const byRealm = new Map<string, { roles: string[]; permissions: string[] }>();
    for (const ur of user.roles) {
      const r = ur.role.realm;
      const bucket = byRealm.get(r) ?? { roles: [], permissions: [] };
      bucket.roles.push(ur.role.name);
      bucket.permissions.push(...ur.role.permissions.map((p) => p.permission.name));
      byRealm.set(r, bucket);
    }
    return {
      id: user.id,
      email: user.email,
      realms: [...byRealm.entries()].map(([realm, data]) => ({
        realm,
        roles: [...new Set(data.roles)].sort(),
        permissions: [...new Set(data.permissions)].sort()
      }))
    };
  }

  private hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
