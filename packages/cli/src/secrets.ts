import { randomBytes } from "node:crypto";

/**
 * Generates a cryptographically secure secret suitable for JWT signing keys.
 * Returns a URL-safe base64 string. 48 bytes → 64 base64url chars (~384 bits).
 */
export function generateSecret(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

const WEAK_SECRET_VALUES = new Set([
  "secret",
  "changeme",
  "change-me",
  "change-me-to-a-long-random-secret",
  "change-me-too",
  "password",
  "jwt",
  "jwt-secret",
  "test",
  "test-jwt-secret",
  "test-jwt-refresh-secret",
  "dev",
  "development"
]);

/** Minimum acceptable secret length (characters). */
export const MIN_SECRET_LENGTH = 32;

/**
 * Estimates Shannon entropy (bits) of a string. Used to flag low-entropy
 * secrets such as `aaaaaaaa...` that pass a naive length check.
 */
export function shannonEntropyBits(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bitsPerChar = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bitsPerChar -= p * Math.log2(p);
  }
  return bitsPerChar * value.length;
}

export type SecretWeakness = {
  weak: boolean;
  reason?: string;
};

/**
 * Returns whether a secret is weak/predictable and why. A secret is weak when
 * it is empty, a known placeholder, too short, or has insufficient entropy.
 */
export function inspectSecret(value: string | undefined, label = "secret"): SecretWeakness {
  const v = (value ?? "").trim();
  if (!v) return { weak: true, reason: `${label} is empty` };
  if (WEAK_SECRET_VALUES.has(v.toLowerCase())) {
    return { weak: true, reason: `${label} is a well-known default/placeholder value` };
  }
  if (v.length < MIN_SECRET_LENGTH) {
    return { weak: true, reason: `${label} is shorter than ${MIN_SECRET_LENGTH} characters` };
  }
  if (shannonEntropyBits(v) < 64) {
    return { weak: true, reason: `${label} has insufficient entropy` };
  }
  return { weak: false };
}

export function isWeakSecret(value: string | undefined): boolean {
  return inspectSecret(value).weak;
}

const COMMON_WEAK_PASSWORDS = new Set([
  "admin",
  "administrator",
  "password",
  "passw0rd",
  "123456",
  "12345678",
  "changeme",
  "change-me",
  "letmein",
  "welcome",
  "qwerty",
  "root",
  "test",
  "secret"
]);

export const MIN_PASSWORD_LENGTH = 8;

export function inspectPassword(value: string | undefined): SecretWeakness {
  const v = value ?? "";
  if (!v) return { weak: true, reason: "password is empty" };
  if (COMMON_WEAK_PASSWORDS.has(v.toLowerCase())) {
    return { weak: true, reason: "password is a common/guessable value" };
  }
  if (v.length < MIN_PASSWORD_LENGTH) {
    return { weak: true, reason: `password is shorter than ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { weak: false };
}
