import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getWatchlistByIdMock = vi.hoisted(() => vi.fn());
const syncWatchlistSymbolsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  getWatchlistById: getWatchlistByIdMock,
  syncWatchlistSymbols: syncWatchlistSymbolsMock,
}));

import { POST } from "@/app/api/admin/watchlists/[listId]/symbols/bulk-sync/route";

describe("POST /api/admin/watchlists/[listId]/symbols/bulk-sync", () => {
  beforeEach(() => {
    getWatchlistByIdMock.mockReset();
    syncWatchlistSymbolsMock.mockReset();
  });

  it("syncs symbols for valid payload", async () => {
    getWatchlistByIdMock.mockResolvedValue({
      id: "list-1",
      name: "测试清单",
    });
    syncWatchlistSymbolsMock.mockResolvedValue({
      total: 2,
      createdOrLinked: 1,
      removed: 0,
      reordered: 1,
    });

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-1/symbols/bulk-sync",
      {
        method: "POST",
        body: JSON.stringify({
          symbols: ["tsla", "aapl"],
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ listId: "list-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(syncWatchlistSymbolsMock).toHaveBeenCalledWith("list-1", ["TSLA", "AAPL"]);
  });

  it("returns 404 when list does not exist", async () => {
    getWatchlistByIdMock.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-404/symbols/bulk-sync",
      {
        method: "POST",
        body: JSON.stringify({
          symbols: ["TSLA"],
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ listId: "list-404" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("watchlist not found");
    expect(syncWatchlistSymbolsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for empty symbol list", async () => {
    getWatchlistByIdMock.mockResolvedValue({
      id: "list-1",
      name: "测试清单",
    });

    const request = new NextRequest(
      "http://localhost/api/admin/watchlists/list-1/symbols/bulk-sync",
      {
        method: "POST",
        body: JSON.stringify({
          symbols: [],
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ listId: "list-1" }),
    });

    expect(response.status).toBe(400);
    expect(syncWatchlistSymbolsMock).not.toHaveBeenCalled();
  });
});
