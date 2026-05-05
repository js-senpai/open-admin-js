import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

/** Safe realm segment for `Role.realm` / JWT (extend pattern in DB if you need more). */
const REALM_SLUG = /^[a-z][a-z0-9_-]{0,63}$/i;

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** When omitted, defaults to `admin` (back-office). Use `public` for storefront tokens, or any custom realm you seed. */
  @IsOptional()
  @IsString()
  @Matches(REALM_SLUG, { message: "realm must be a short slug (e.g. admin, public, partner_api)" })
  realm?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;

  /** Must match the realm used when the refresh token was issued (same default as login). */
  @IsOptional()
  @IsString()
  @Matches(REALM_SLUG, { message: "realm must be a short slug (e.g. admin, public, partner_api)" })
  realm?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}
