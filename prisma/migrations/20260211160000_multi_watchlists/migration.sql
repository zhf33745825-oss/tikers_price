-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WatchlistMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "watchlistId" TEXT NOT NULL,
    "watchSymbolId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchlistMember_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchlistMember_watchSymbolId_fkey" FOREIGN KEY ("watchSymbolId") REFERENCES "WatchSymbol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_name_key" ON "Watchlist"("name");

-- CreateIndex
CREATE INDEX "Watchlist_sortOrder_idx" ON "Watchlist"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistMember_watchlistId_watchSymbolId_key" ON "WatchlistMember"("watchlistId", "watchSymbolId");

-- CreateIndex
CREATE INDEX "WatchlistMember_watchlistId_enabled_sortOrder_idx" ON "WatchlistMember"("watchlistId", "enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "WatchlistMember_watchSymbolId_idx" ON "WatchlistMember"("watchSymbolId");

-- Seed a default watchlist and migrate legacy single-watchlist ordering/membership.
INSERT INTO "Watchlist" (
    "id",
    "name",
    "sortOrder",
    "isDefault",
    "createdAt",
    "updatedAt"
)
VALUES (
    'legacy-default-watchlist',
    '默认清单',
    1,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

INSERT INTO "WatchlistMember" (
    "id",
    "watchlistId",
    "watchSymbolId",
    "enabled",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    lower(hex(randomblob(16))),
    'legacy-default-watchlist',
    ws."id",
    ws."enabled",
    ws."sortOrder",
    ws."createdAt",
    ws."updatedAt"
FROM "WatchSymbol" AS ws;
