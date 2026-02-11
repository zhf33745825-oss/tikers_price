import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduleAsyncTailRefreshForSymbolsMock = vi.hoisted(() => vi.fn());
const getPriceSeriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/cache-hydration", () => ({
  scheduleAsyncTailRefreshForSymbols: scheduleAsyncTailRefreshForSymbolsMock,
}));

vi.mock("@/lib/stock/repository", () => ({
  getPriceSeries: getPriceSeriesMock,
}));

import { queryHistoricalSeries } from "@/lib/stock/query";

function date(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`);
}

describe("queryHistoricalSeries", () => {
  beforeEach(() => {
    scheduleAsyncTailRefreshForSymbolsMock.mockReset();
    getPriceSeriesMock.mockReset();
  });

  it("returns database data and schedules async refresh without waiting", async () => {
    getPriceSeriesMock.mockResolvedValue([
      {
        symbol: "AAPL",
        currency: "USD",
        points: [{ date: "2025-01-02", close: 100, adjClose: 100 }],
      },
    ]);

    const response = await queryHistoricalSeries({
      symbols: ["AAPL"],
      range: {
        from: "2025-01-01",
        to: "2025-01-10",
        fromDate: date("2025-01-01"),
        toDate: date("2025-01-10"),
      },
    });

    expect(scheduleAsyncTailRefreshForSymbolsMock).toHaveBeenCalledTimes(1);
    expect(response.series).toHaveLength(1);
    expect(response.series[0].symbol).toBe("AAPL");
    expect(response.warnings).toEqual([]);
  });
});
