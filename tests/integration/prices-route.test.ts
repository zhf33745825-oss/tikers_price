import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryHistoricalSeriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/query", () => ({
  queryHistoricalSeries: queryHistoricalSeriesMock,
}));

import { GET } from "@/app/api/prices/route";

describe("GET /api/prices", () => {
  beforeEach(() => {
    queryHistoricalSeriesMock.mockReset();
  });

  it("returns parsed payload on success", async () => {
    queryHistoricalSeriesMock.mockResolvedValue({
      range: { from: "2024-01-01", to: "2024-01-31" },
      series: [],
      warnings: [],
    });

    const request = new NextRequest(
      "http://localhost/api/prices?symbols=AAPL,MSFT&from=2024-01-01&to=2024-01-31",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.range.from).toBe("2024-01-01");
    expect(queryHistoricalSeriesMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when symbol count exceeds limit", async () => {
    const symbols = new Array(21).fill(0).map((_, idx) => `SYM${idx}`).join(",");
    const request = new NextRequest(
      `http://localhost/api/prices?symbols=${encodeURIComponent(symbols)}`,
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("at most");
    expect(queryHistoricalSeriesMock).not.toHaveBeenCalled();
  });
});

