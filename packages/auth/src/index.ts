export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type LoginInput = {
  email: string;
  password: string;
};

export const publicAuthRoutes = [
  "/auth/login",
  "/auth/password/forgot",
  "/auth/password/reset",
  "/auth/email/verify"
] as const;
