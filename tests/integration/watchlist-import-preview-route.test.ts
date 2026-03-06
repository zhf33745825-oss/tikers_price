import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getWatchlistByIdMock = vi.hoisted(() => vi.fn());
const previewWatchlistImportSymbolsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  getWatchlistById: getWatchlistByIdMock,
}));

vi.mock("@/lib/stock/symbol-import", () => ({
  previewWatchlistImportSymbols: previewWatchlistImportSymbolsMock,
}));

import { POST } from "@/app/api/admin/watchlists/[listId]/symbols/import-preview/route";

describe("POST /api/admin/watchlists/[listId]/symbols/import-preview", () => {
  beforeEach(() => {
    getWatchlistByIdMock.mockReset();
    previewWatchlistImportSymbolsMock.mockReset();
  });

  it("returns preview rows for valid request", async () => {
    getWatchlistByIdMock.mockResolvedValue({ id: "list-1", name: "默认清单" });
    previewWatchlistImportSymbolsMock.mockResolvedValue({
      items: [
        {
          input: "TSLA",
          normalized: "TSLA",
          status: "matched",
          message: "精确匹配",
          resolvedSymbol: "TSLA",
          candidates: [],
        },
      ],
    });

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-1/symbols/import-preview",
      {
        method: "POST",
        body: JSON.stringify({ symbols: ["TSLA"] }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ listId: "list-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(previewWatchlistImportSymbolsMock).toHaveBeenCalledWith("list-1", ["TSLA"], 8);
  });

  it("returns 404 when watchlist does not exist", async () => {
    getWatchlistByIdMock.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/missing/symbols/import-preview",
      {
        method: "POST",
        body: JSON.stringify({ symbols: ["TSLA"] }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ listId: "missing" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("watchlist not found");
    expect(previewWatchlistImportSymbolsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for empty symbols", async () => {
    getWatchlistByIdMock.mockResolvedValue({ id: "list-1", name: "默认清单" });

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-1/symbols/import-preview",
      {
        method: "POST",
        body: JSON.stringify({ symbols: [] }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ listId: "list-1" }),
    });

    expect(response.status).toBe(400);
    expect(previewWatchlistImportSymbolsMock).not.toHaveBeenCalled();
  });
});
