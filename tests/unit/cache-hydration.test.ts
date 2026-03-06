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
  buildRefreshWindows,
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

  it("prioritizes recent seed window when configured and symbol has no local data", () => {
    const window = buildTailRefreshWindow(
      date("2024-01-01"),
      date("2025-01-10"),
      undefined,
      {
        recentSeedLookbackDays: 30,
      },
    );

    expect(window?.fromDate.toISOString()).toBe("2024-12-12T00:00:00.000Z");
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

describe("buildRefreshWindows", () => {
  it("returns frontfill window when requested range starts before local minimum", () => {
    const windows = buildRefreshWindows(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2025-01-05"),
        maxTradeDate: date("2025-01-10"),
      },
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]?.fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(windows[0]?.toDate.toISOString()).toBe("2025-01-04T00:00:00.000Z");
  });

  it("returns both frontfill and tailfill windows when both boundaries are missing", () => {
    const windows = buildRefreshWindows(
      date("2025-01-01"),
      date("2025-01-10"),
      {
        minTradeDate: date("2025-01-04"),
        maxTradeDate: date("2025-01-07"),
      },
    );

    expect(windows).toHaveLength(2);
    expect(windows[0]?.fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(windows[0]?.toDate.toISOString()).toBe("2025-01-03T00:00:00.000Z");
    expect(windows[1]?.fromDate.toISOString()).toBe("2025-01-08T00:00:00.000Z");
    expect(windows[1]?.toDate.toISOString()).toBe("2025-01-10T00:00:00.000Z");
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

  it("bypasses cooldown when refresh is forced", async () => {
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
      force: true,
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
    });
    await waitForAsyncTailRefreshForTests();

    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenCalledTimes(2);
  });

  it("retries failed refresh after short retry cooldown", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map([
      ["AAPL", {
        minTradeDate: date("2024-01-01"),
        maxTradeDate: date("2025-01-10"),
      }],
    ]));
    fetchHistoricalFromYahooWithResolutionMock
      .mockRejectedValueOnce(new Error("temporary yahoo error"))
      .mockResolvedValueOnce({
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

    vi.advanceTimersByTime(30_001);

    scheduleAsyncTailRefreshForSymbols({
      source: "matrix",
      symbols: ["AAPL"],
      fromDate: date("2025-01-01"),
      toDate: date("2025-01-20"),
    });
    await waitForAsyncTailRefreshForTests();

    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenCalledTimes(2);
  });

  it("prioritizes a small recent seed window before backfilling older history for empty symbols", async () => {
    getTradeDateBoundsBySymbolsMock.mockResolvedValue(new Map());
    fetchHistoricalFromYahooWithResolutionMock
      .mockResolvedValueOnce({
        sourceSymbol: "MCD",
        resolvedSymbol: "MCD",
        points: [
          {
            tradeDate: date("2025-01-18"),
            close: 300.12,
            adjClose: 300.12,
            currency: "USD",
          },
        ],
      })
      .mockResolvedValueOnce({
        sourceSymbol: "MCD",
        resolvedSymbol: "MCD",
        points: [
          {
            tradeDate: date("2024-12-01"),
            close: 290.12,
            adjClose: 290.12,
            currency: "USD",
          },
        ],
      });
    upsertDailyPricesMock.mockResolvedValue(1);

    scheduleAsyncTailRefreshForSymbols({
      source: "matrix",
      symbols: ["MCD"],
      fromDate: date("2024-01-01"),
      toDate: date("2025-01-20"),
      strategy: {
        recentSeedLookbackDays: 14,
        backfillLookbackDays: 120,
      },
    });

    await waitForAsyncTailRefreshForTests();

    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenCalledTimes(2);
    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenNthCalledWith(
      1,
      "MCD",
      date("2025-01-07"),
      date("2025-01-20"),
    );
    expect(fetchHistoricalFromYahooWithResolutionMock).toHaveBeenNthCalledWith(
      2,
      "MCD",
      date("2024-09-23"),
      date("2025-01-06"),
    );
    expect(upsertDailyPricesMock).toHaveBeenCalledTimes(2);
  });
});
