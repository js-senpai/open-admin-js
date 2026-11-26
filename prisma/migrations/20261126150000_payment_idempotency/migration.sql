ALTER TABLE "Order" ADD COLUMN "checkoutKey" TEXT, ADD COLUMN "checkoutRequestHash" TEXT, ADD COLUMN "checkoutSessionId" TEXT, ADD COLUMN "paymentIntentId" TEXT;
ALTER TABLE "WebhookLog" ADD COLUMN "providerEventId" TEXT;
CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");
CREATE UNIQUE INDEX "Order_checkoutSessionId_key" ON "Order"("checkoutSessionId");
CREATE UNIQUE INDEX "Order_paymentIntentId_key" ON "Order"("paymentIntentId");
CREATE UNIQUE INDEX "WebhookLog_providerEventId_key" ON "WebhookLog"("providerEventId");
