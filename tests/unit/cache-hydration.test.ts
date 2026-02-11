import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getTradeDateBoundsBySymbolsMock = vi.hoisted(() => vi.fn());
const upsertDailyPricesMock = vi.hoisted(() => vi.fn());
const fetchHistoricalFromYahooWithResolutionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  getTradeDateBoundsBySymbols: getTradeDateBoundsBySymbolsMock,
  upsertDailyPrices: upsertDailyPricesMock,
}));

vi.mock("@/lib/stock/yahoo", () => ({
  fetchHistoricalFromYahooWithResolution: fetchHistoricalFromYahooWithResolutionMock,
}));

import {
  buildTailRefreshWindow,
  resetAsyncTailRefreshStateForTests,
  scheduleAsyncTailRefreshForSymbols,
  waitForAsyncTailRefreshForTests,
} from "@/lib/stock/cache-hydration";

function date(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`);
}

describe("buildTailRefreshWindow", () => {
  it("returns full range when symbol has no local data", () => {
    const window = buildTailRefreshWindow(
      date("2025-01-01"),
      date("2025-01-10"),
      undefined,
    );

    expect(window?.fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(window?.toDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
  });

  it("returns null when local data already covers requested end date", () => {
    const window = buildTailRefreshWindow(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2024-01-01"),
        maxTradeDate: date("2025-01-10"),
      },
    );

    expect(window).toBeNull();
  });

  it("returns only tail refresh window", () => {
    const window = buildTailRefreshWindow(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2024-01-01"),
        maxTradeDate: date("2025-01-06"),
      },
    );

    expect(window?.fromDate.toISOString()).toBe("2025-01-07T00:00:00.000Z");
    expect(window?.toDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
  });

  it("expands one-day refresh window to avoid identical period1/period2", () => {
    const window = buildTailRefreshWindow(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2024-01-01"),
        maxTradeDate: date("2025-01-09"),
      },
    );

    expect(window?.fromDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
    expect(window?.toDate.toISOString()).toBe("2025-01-11T00:00:00.000Z");
  });
});

describe("scheduleAsyncTailRefreshForSymbols", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date("2025-01-20"));
    getTradeDateBoundsBySymbolsMock.mockReset();
    upsertDailyPricesMock.mockReset();
    fetchHistoricalFromYahooWithResolutionMock.mockReset();
    resetAsyncTailRefreshStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches only tail gap and upserts rows", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map([
      ["AAPL", {
        minTradeDate: date("2024-01-01"),
        maxTradeDate: date("2025-01-10"),
      }],
    ]));
    fetchHistoricalFromYahooWithResolutionMock.mockResolvedValue({
      sourceSymbol: "AAPL",
      resolvedSymbol: "AAPL",
      points: [
        {
          tradeDate: date("2025-01-11"),
          close: 190.12,
          adjClose: 190.12,
          currency: "USD",
        },
      ],
    });
    upsertDailyPricesMock.mockResolvedValue(1);

    scheduleAsyncTailRefreshForSymbols({
      source: "matrix",
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
    });

    await waitForAsyncTailRefreshForTests();

    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenCalledTimes(1);
    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenCalledWith(
      "AAPL",
      date("2025-01-11"),
      date("2025-01-20"),
    );
    expect(upsertDailyPricesMock).toHaveBeenCalledTimes(1);
  });

  it("skips repeated refresh in cooldown window", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map([
      ["AAPL", {
        minTradeDate: date("2024-01-01"),
        maxTradeDate: date("2025-01-10"),
      }],
    ]));
    fetchHistoricalFromYahooWithResolutionMock.mockResolvedValue({
      sourceSymbol: "AAPL",
      resolvedSymbol: "AAPL",
      points: [],
    });

    scheduleAsyncTailRefreshForSymbols({
      source: "matrix",
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
    });
    await waitForAsyncTailRefreshForTests();

    scheduleAsyncTailRefreshForSymbols({
      source: "matrix",
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
    });
    await waitForAsyncTailRefreshForTests();

    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenCalledTimes(1);
  });
});
