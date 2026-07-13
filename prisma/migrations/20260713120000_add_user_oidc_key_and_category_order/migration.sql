-- AlterTable
ALTER TABLE "User" ADD COLUMN "oidcKey" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "User_oidcKey_key" ON "User"("oidcKey");

-- CreateIndex
CREATE INDEX "Category_order_idx" ON "Category"("order");
