import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureDefaultWatchlistMock = vi.hoisted(() => vi.fn());
const hydrateHistoricalCacheForSymbolsMock = vi.hoisted(() => vi.fn());
const getDailyPriceRowsMock = vi.hoisted(() => vi.fn());
const getLatestPriceSnapshotsMock = vi.hoisted(() => vi.fn());
const getWatchSymbolRecordsBySymbolsMock = vi.hoisted(() => vi.fn());
const listWatchSymbolRecordsMock = vi.hoisted(() => vi.fn());
const updateWatchSymbolAutoMetaMock = vi.hoisted(() => vi.fn());
const fetchQuoteMetadataFromYahooMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/bootstrap", () => ({
  ensureDefaultWatchlist: ensureDefaultWatchlistMock,
}));

vi.mock("@/lib/stock/cache-hydration", () => ({
  hydrateHistoricalCacheForSymbols: hydrateHistoricalCacheForSymbolsMock,
}));

vi.mock("@/lib/stock/repository", () => ({
  getDailyPriceRows: getDailyPriceRowsMock,
  getLatestPriceSnapshots: getLatestPriceSnapshotsMock,
  getWatchSymbolRecordsBySymbols: getWatchSymbolRecordsBySymbolsMock,
  listWatchSymbolRecords: listWatchSymbolRecordsMock,
  updateWatchSymbolAutoMeta: updateWatchSymbolAutoMetaMock,
}));

vi.mock("@/lib/stock/yahoo", () => ({
  fetchQuoteMetadataFromYahoo: fetchQuoteMetadataFromYahooMock,
}));

import { getMatrixPriceData } from "@/lib/stock/matrix";

describe("getMatrixPriceData cache-first flow", () => {
  beforeEach(() => {
    ensureDefaultWatchlistMock.mockReset();
    hydrateHistoricalCacheForSymbolsMock.mockReset();
    getDailyPriceRowsMock.mockReset();
    getLatestPriceSnapshotsMock.mockReset();
    getWatchSymbolRecordsBySymbolsMock.mockReset();
    listWatchSymbolRecordsMock.mockReset();
    updateWatchSymbolAutoMetaMock.mockReset();
    fetchQuoteMetadataFromYahooMock.mockReset();
  });

  it("returns DB rows while keeping hydration warning in payload", async () => {
    const now = new Date();
    const tradeDate = new Date("2025-01-02T00:00:00.000Z");

    listWatchSymbolRecordsMock.mockResolvedValue([
      {
        symbol: "AAPL",
        displayName: null,
        regionOverride: null,
        autoName: "Apple Inc.",
        autoRegion: "US",
        autoCurrency: "USD",
        metaUpdatedAt: now,
        enabled: true,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    hydrateHistoricalCacheForSymbolsMock.mockImplementation(async ({ warnings }) => {
      warnings.push("AAPL: failed to fetch missing historical data (Yahoo source unavailable)");
    });

    getDailyPriceRowsMock.mockResolvedValue([
      {
        symbol: "AAPL",
        tradeDate,
        close: 100.12,
        adjClose: 100.12,
        currency: "USD",
      },
    ]);

    getLatestPriceSnapshotsMock.mockResolvedValue(new Map([
      ["AAPL", {
        symbol: "AAPL",
        tradeDate,
        close: 100.12,
        currency: "USD",
      }],
    ]));
    getWatchSymbolRecordsBySymbolsMock.mockResolvedValue(new Map());

    const payload = await getMatrixPriceData({
      mode: "watchlist",
      preset: "30",
    });

    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].symbol).toBe("AAPL");
    expect(payload.rows[0].pricesByDate["2025-01-02"]).toBe(100.12);
    expect(payload.warnings).toEqual([]);
    expect(hydrateHistoricalCacheForSymbolsMock).toHaveBeenCalledTimes(1);
    expect(fetchQuoteMetadataFromYahooMock).not.toHaveBeenCalled();
  });
});
