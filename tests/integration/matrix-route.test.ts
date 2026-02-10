import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InputError } from "@/lib/stock/errors";

const getMatrixPriceDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/matrix", () => ({
  getMatrixPriceData: getMatrixPriceDataMock,
}));

import { GET } from "@/app/api/prices/matrix/route";

describe("GET /api/prices/matrix", () => {
  beforeEach(() => {
    getMatrixPriceDataMock.mockReset();
  });

  it("returns matrix payload", async () => {
    getMatrixPriceDataMock.mockResolvedValue({
      mode: "watchlist",
      range: {
        from: "2025-01-01",
        to: "2025-01-31",
        preset: "30",
      },
      dates: ["2025-01-02"],
      displayDates: ["25.01.02"],
      rows: [],
      warnings: [],
    });

    const request = new NextRequest("http://localhost/api/prices/matrix?preset=30");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.range.preset).toBe("30");
    expect(getMatrixPriceDataMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for input errors", async () => {
    getMatrixPriceDataMock.mockRejectedValue(new InputError("matrix input error"));

    const request = new NextRequest("http://localhost/api/prices/matrix?preset=custom");
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
