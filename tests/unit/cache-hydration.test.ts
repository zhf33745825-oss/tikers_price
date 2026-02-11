import { beforeEach, describe, expect, it, vi } from "vitest";

const getTradeDateBoundsBySymbolsMock = vi.hoisted(() => vi.fn());
const upsertDailyPricesMock = vi.hoisted(() => vi.fn());
const fetchHistoricalFromYahooMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  getTradeDateBoundsBySymbols: getTradeDateBoundsBySymbolsMock,
  upsertDailyPrices: upsertDailyPricesMock,
}));

vi.mock("@/lib/stock/yahoo", () => ({
  fetchHistoricalFromYahoo: fetchHistoricalFromYahooMock,
}));

import {
  buildMissingWindowsForRange,
  hydrateHistoricalCacheForSymbols,
} from "@/lib/stock/cache-hydration";

function date(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`);
}

describe("buildMissingWindowsForRange", () => {
  it("returns full range when no local bounds exist", () => {
    const windows = buildMissingWindowsForRange(
      date("2025-01-01"),
      date("2025-01-10"),
      undefined,
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(windows[0].toDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
  });

  it("returns only front missing window", () => {
    const windows = buildMissingWindowsForRange(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2025-01-05"),
        maxTradeDate: date("2025-01-10"),
      },
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(windows[0].toDate.toISOString()).toBe("2025-01-04T00:00:00.000Z");
  });

  it("returns only tail missing window", () => {
    const windows = buildMissingWindowsForRange(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2025-01-01"),
        maxTradeDate: date("2025-01-06"),
      },
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].fromDate.toISOString()).toBe("2025-01-07T00:00:00.000Z");
    expect(windows[0].toDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
  });

  it("returns front and tail windows when local data is in the middle", () => {
    const windows = buildMissingWindowsForRange(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2025-01-04"),
        maxTradeDate: date("2025-01-07"),
      },
    );

    expect(windows).toHaveLength(2);
    expect(windows[0].fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(windows[0].toDate.toISOString()).toBe("2025-01-03T00:00:00.000Z");
    expect(windows[1].fromDate.toISOString()).toBe("2025-01-08T00:00:00.000Z");
    expect(windows[1].toDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
  });

  it("returns no windows when local data fully covers range", () => {
    const windows = buildMissingWindowsForRange(
      date("2025-01-03"),
      date("2025-01-08"),
      {
        minTradeDate: date("2025-01-01"),
        maxTradeDate: date("2025-01-10"),
      },
    );

    expect(windows).toEqual([]);
  });
});

describe("hydrateHistoricalCacheForSymbols", () => {
  beforeEach(() => {
    getTradeDateBoundsBySymbolsMock.mockReset();
    upsertDailyPricesMock.mockReset();
    fetchHistoricalFromYahooMock.mockReset();
  });

  it("does not fetch externally when range is already covered by database", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map([
      ["AAPL", {
        minTradeDate: date("2025-01-01"),
        maxTradeDate: date("2025-01-31"),
      }],
    ]));

    const warnings: string[] = [];
    await hydrateHistoricalCacheForSymbols({
      symbols: ["AAPL"],
      fromDate: date("2025-01-05"),
      toDate: date("2025-01-20"),
      warnings,
    });

    expect(fetchHistoricalFromYahooMock).not.toHaveBeenCalled();
    expect(upsertDailyPricesMock).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
  });

  it("fetches only missing tail window and upserts fetched points", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map([
      ["AAPL", {
        minTradeDate: date("2025-01-01"),
        maxTradeDate: date("2025-01-10"),
      }],
    ]));

    fetchHistoricalFromYahooMock.mockResolvedValue([
      {
        tradeDate: date("2025-01-11"),
        close: 190.12,
        adjClose: 190.12,
        currency: "USD",
      },
    ]);
    upsertDailyPricesMock.mockResolvedValue(1);

    const warnings: string[] = [];
    await hydrateHistoricalCacheForSymbols({
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
      warnings,
    });

    expect(fetchHistoricalFromYahooMock).toHaveBeenCalledTimes(1);
    expect(fetchHistoricalFromYahooMock).toHaveBeenCalledWith(
      "AAPL",
      date("2025-01-11"),
      date("2025-01-20"),
    );
    expect(upsertDailyPricesMock).toHaveBeenCalledTimes(1);
    expect(warnings).toEqual([]);
  });

  it("keeps flowing and writes warning when external fetch fails", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map());
    fetchHistoricalFromYahooMock.mockRejectedValue(
      new Error("Yahoo source unavailable (network/region restriction)"),
    );

    const warnings: string[] = [];
    await hydrateHistoricalCacheForSymbols({
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
      warnings,
    });

    expect(fetchHistoricalFromYahooMock).toHaveBeenCalledTimes(1);
    expect(upsertDailyPricesMock).not.toHaveBeenCalled();
    expect(warnings[0]).toContain("AAPL: failed to fetch missing historical data");
    expect(warnings[0]).toContain("Yahoo source unavailable");
  });

  it("expands one-day windows so period1 and period2 are not identical", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map([
      ["AAPL", {
        minTradeDate: date("2025-01-02"),
        maxTradeDate: date("2025-01-10"),
      }],
    ]));
    fetchHistoricalFromYahooMock.mockResolvedValue([]);

    const warnings: string[] = [];
    await hydrateHistoricalCacheForSymbols({
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
      warnings,
    });

    expect(fetchHistoricalFromYahooMock).toHaveBeenNthCalledWith(
      1,
      "AAPL",
      date("2025-01-01"),
      date("2025-01-02"),
    );
  });
});
