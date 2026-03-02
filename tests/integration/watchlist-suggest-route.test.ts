import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getWatchlistByIdMock = vi.hoisted(() => vi.fn());
const searchSymbolSuggestionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  getWatchlistById: getWatchlistByIdMock,
}));

vi.mock("@/lib/stock/symbol-suggest", () => ({
  searchSymbolSuggestions: searchSymbolSuggestionsMock,
}));

import { GET } from "@/app/api/admin/watchlists/[listId]/symbols/suggest/route";

describe("GET /api/admin/watchlists/[listId]/symbols/suggest", () => {
  beforeEach(() => {
    getWatchlistByIdMock.mockReset();
    searchSymbolSuggestionsMock.mockReset();
  });

  it("returns symbol suggestions for valid query", async () => {
    getWatchlistByIdMock.mockResolvedValue({
      id: "list-1",
      name: "测试清单",
    });
    searchSymbolSuggestionsMock.mockResolvedValue({
      items: [
        {
          symbol: "TSLA",
          name: "Tesla, Inc.",
          exchange: "NASDAQ",
          region: "US",
          type: "Equity",
        },
      ],
      source: "yahoo",
    });

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-1/symbols/suggest?q=ts&limit=8",
    );
    const response = await GET(request, {
      params: Promise.resolve({ listId: "list-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("yahoo");
    expect(body.items).toHaveLength(1);
    expect(searchSymbolSuggestionsMock).toHaveBeenCalledWith("TS", 8);
  });

  it("returns 404 when watchlist does not exist", async () => {
    getWatchlistByIdMock.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-404/symbols/suggest?q=ts&limit=8",
    );
    const response = await GET(request, {
      params: Promise.resolve({ listId: "list-404" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("watchlist not found");
    expect(searchSymbolSuggestionsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid query format", async () => {
    getWatchlistByIdMock.mockResolvedValue({
      id: "list-1",
      name: "测试清单",
    });

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-1/symbols/suggest?q=ABC@@",
    );
    const response = await GET(request, {
      params: Promise.resolve({ listId: "list-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid query format/);
    expect(searchSymbolSuggestionsMock).not.toHaveBeenCalled();
  });
});
