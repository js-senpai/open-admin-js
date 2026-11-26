import { BadRequestException, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
    @Inject(ConfigService) private readonly config: ConfigService,
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
    if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.passwordHash))) {
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

  /** OIDC / OAuth2 Authorization Code + PKCE — link by `oidcKey` or existing email. */
  async loginWithOidcProfile(
    profile: { sub: string; issuer: string; email: string; name?: string | null; picture?: string | null },
    meta: { ipAddress?: string; userAgent?: string },
    realm: string = DEFAULT_AUTH_REALM
  ) {
    const issuer = profile.issuer.replace(/\/$/, "");
    const oidcKey = `${issuer}::${profile.sub}`;
    const emailNorm = profile.email.toLowerCase().trim();
    let user = await this.prisma.user.findFirst({
      where: { oidcKey },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });

    if (!user) {
      const existing = await this.prisma.user.findUnique({ where: { email: emailNorm } });
      if (existing) throw new UnauthorizedException({ message: "Explicit account linking required", code: "OIDC_LINK_REQUIRED" });
      const randomPass = randomBytes(48).toString("hex");
      const created = await this.prisma.user.create({
        data: {
          email: emailNorm,
          name: profile.name ?? null,
          avatarUrl: profile.picture ?? null,
          passwordHash: await bcrypt.hash(randomPass, 12),
          oidcKey
        }
      });
      const roleName = this.config.get<string>("OIDC_DEFAULT_ROLE")?.trim() ?? "viewer";
      const role = await this.prisma.role.findUnique({
        where: { name_realm: { name: roleName, realm } }
      });
      if (role) {
        await this.prisma.userRole.create({ data: { userId: created.id, roleId: role.id } });
      }
      user = await this.prisma.user.findUniqueOrThrow({
        where: { id: created.id },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
      });
    } else {
      if (user.status !== "active") throw new UnauthorizedException({ message: "Invalid account", code: "AUTH_INVALID" });
      const updates: { oidcKey?: string; avatarUrl?: string | null; name?: string | null } = {};
      if (!user.oidcKey) updates.oidcKey = oidcKey;
      if (profile.picture && !user.avatarUrl) updates.avatarUrl = profile.picture;
      if (profile.name && !user.name) updates.name = profile.name;
      if (Object.keys(updates).length) {
        await this.prisma.user.update({ where: { id: user.id }, data: updates });
        user = await this.prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
        });
      }
    }

    const assignments = user.roles.filter((ur) => ur.role.realm === realm);
    if (assignments.length === 0) {
      throw new UnauthorizedException({
        message: "OIDC account has no role in this realm. Ask an admin to assign a role.",
        code: "AUTH_REALM_EMPTY"
      });
    }

    const session = await this.issueSession(user.id, realm);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "login.sso",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        after: { realm, issuer, oidcKey }
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
    const session = await this.prisma.session.create({
      data: {
        userId, realm,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tokens: { create: { tokenHash: this.hashToken(refreshToken) } }
      }
    });
    return this.sessionResponse(userId, realm, session.id, refreshToken);
  }

  private async sessionResponse(userId: string, realm: string, sessionId: string, refreshToken: string) {
    return {
      accessToken: await this.jwt.signAsync({ sub: userId, realm, sid: sessionId }),
      refreshToken,
      expiresIn: 900
    };
  }

  async refresh(refreshToken: string, realm: string = DEFAULT_AUTH_REALM) {
    const denied = () => new UnauthorizedException({ message: "Invalid refresh token", code: "REFRESH_INVALID" });
    if (!/^[A-Za-z0-9_-]{64}$/.test(refreshToken)) throw denied();
    const token = await this.prisma.sessionToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { session: { include: { user: { include: { roles: { include: { role: true } } } } } } }
    });
    if (!token || token.session.realm !== realm || token.session.revokedAt || token.session.expiresAt <= new Date()) throw denied();
    if (token.session.user.status !== "active" || !token.session.user.roles.some(r => r.role.realm === realm)) throw denied();
    const nextToken = randomBytes(48).toString("base64url");
    const rotated = await this.prisma.$transaction(async tx => {
      // Lock/claim the family row first so refresh/logout/reuse are serialized.
      const locked = await tx.session.updateMany({
        where: { id: token.sessionId, realm, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { lastUsedAt: new Date() }
      });
      if (locked.count !== 1) return false;
      const claimed = await tx.sessionToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() }
      });
      if (claimed.count !== 1) {
        // Commit revocation even when a rotated token is replayed.
        await tx.session.update({ where: { id: token.sessionId }, data: { revokedAt: new Date() } });
        return false;
      }
      await tx.sessionToken.create({ data: { sessionId: token.sessionId, tokenHash: this.hashToken(nextToken) } });
      return true;
    });
    if (!rotated) throw denied();
    return this.sessionResponse(token.session.userId, realm, token.sessionId, nextToken);
  }

  async logout(userId: string, sessionId: string, meta: { ipAddress?: string; userAgent?: string }) {
    await this.prisma.$transaction(async tx => {
      await tx.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { userId, action: "logout", ipAddress: meta.ipAddress, userAgent: meta.userAgent } });
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
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException({ message: "Invalid or expired reset token", code: "RESET_TOKEN_INVALID" });
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash: nextPasswordHash, refreshTokenHash: null } });
      await tx.session.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.updateMany({ where: { userId: resetToken.userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: resetToken.userId, action: "password.reset.completed", resource: "auth" } });
    });

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
    if (!user || user.status !== "active") throw new UnauthorizedException({ message: "Invalid session", code: "AUTH_INVALID" });
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
    if (!user || user.status !== "active") throw new UnauthorizedException({ message: "Invalid session", code: "AUTH_INVALID" });
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
