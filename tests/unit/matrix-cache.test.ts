import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureDefaultWatchlistMock = vi.hoisted(() => vi.fn());
const scheduleAsyncTailRefreshForSymbolsMock = vi.hoisted(() => vi.fn());
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
  scheduleAsyncTailRefreshForSymbols: scheduleAsyncTailRefreshForSymbolsMock,
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
    scheduleAsyncTailRefreshForSymbolsMock.mockReset();
    getDailyPriceRowsMock.mockReset();
    getLatestPriceSnapshotsMock.mockReset();
    getWatchSymbolRecordsBySymbolsMock.mockReset();
    listWatchSymbolRecordsMock.mockReset();
    updateWatchSymbolAutoMetaMock.mockReset();
    fetchQuoteMetadataFromYahooMock.mockReset();
  });

  it("returns DB rows immediately and orders dates from newest to oldest", async () => {
    const now = new Date();
    const tradeDateOld = new Date("2025-01-02T00:00:00.000Z");
    const tradeDateNew = new Date("2025-01-03T00:00:00.000Z");

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

    getDailyPriceRowsMock.mockResolvedValue([
      {
        symbol: "AAPL",
        tradeDate: tradeDateOld,
        close: 100.12,
        adjClose: 100.12,
        currency: "USD",
      },
      {
        symbol: "AAPL",
        tradeDate: tradeDateNew,
        close: 101.34,
        adjClose: 101.34,
        currency: "USD",
      },
    ]);

    getLatestPriceSnapshotsMock.mockResolvedValue(new Map([
      ["AAPL", {
        symbol: "AAPL",
        tradeDate: tradeDateNew,
        close: 101.34,
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
    expect(payload.dates).toEqual(["2025-01-03", "2025-01-02"]);
    expect(payload.rows[0].pricesByDate["2025-01-03"]).toBe(101.34);
    expect(payload.rows[0].pricesByDate["2025-01-02"]).toBe(100.12);
    expect(payload.warnings).toEqual([]);
    expect(scheduleAsyncTailRefreshForSymbolsMock).toHaveBeenCalledTimes(1);
    expect(fetchQuoteMetadataFromYahooMock).not.toHaveBeenCalled();
  });
});
