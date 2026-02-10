-- AlterTable
ALTER TABLE "WatchSymbol" ADD COLUMN "regionOverride" TEXT;
ALTER TABLE "WatchSymbol" ADD COLUMN "autoName" TEXT;
ALTER TABLE "WatchSymbol" ADD COLUMN "autoRegion" TEXT;
ALTER TABLE "WatchSymbol" ADD COLUMN "autoCurrency" TEXT;
ALTER TABLE "WatchSymbol" ADD COLUMN "metaUpdatedAt" DATETIME;
ALTER TABLE "WatchSymbol" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill sortOrder using createdAt ascending, then symbol ascending.
UPDATE "WatchSymbol" AS ws
SET "sortOrder" = (
  SELECT COUNT(*)
  FROM "WatchSymbol" AS ws2
  WHERE ws2."createdAt" < ws."createdAt"
    OR (ws2."createdAt" = ws."createdAt" AND ws2."symbol" <= ws."symbol")
);

-- CreateIndex
CREATE INDEX "WatchSymbol_enabled_sortOrder_idx" ON "WatchSymbol"("enabled", "sortOrder");
