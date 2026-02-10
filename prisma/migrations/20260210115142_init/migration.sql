-- CreateTable
CREATE TABLE "WatchSymbol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "tradeDate" DATETIME NOT NULL,
    "close" DECIMAL NOT NULL,
    "adjClose" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'yahoo',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UpdateJobLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobDate" DATETIME NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "totalSymbols" INTEGER NOT NULL,
    "successSymbols" INTEGER NOT NULL,
    "failedSymbols" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchSymbol_symbol_key" ON "WatchSymbol"("symbol");

-- CreateIndex
CREATE INDEX "DailyPrice_symbol_idx" ON "DailyPrice"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPrice_symbol_tradeDate_key" ON "DailyPrice"("symbol", "tradeDate");
