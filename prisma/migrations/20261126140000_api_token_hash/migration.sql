-- Revoke all legacy bcrypt tokens (their plaintext is unavailable).
UPDATE "ApiToken" SET "revokedAt"=CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
