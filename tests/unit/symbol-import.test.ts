import { beforeEach, describe, expect, it, vi } from "vitest";

const listWatchlistMembersMock = vi.hoisted(() => vi.fn());
const searchSymbolSuggestionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  listWatchlistMembers: listWatchlistMembersMock,
}));

vi.mock("@/lib/stock/symbol-suggest", () => ({
  searchSymbolSuggestions: searchSymbolSuggestionsMock,
}));

import { previewWatchlistImportSymbols } from "@/lib/stock/symbol-import";

describe("previewWatchlistImportSymbols", () => {
  beforeEach(() => {
    listWatchlistMembersMock.mockReset();
    searchSymbolSuggestionsMock.mockReset();
  });

  it("marks matched, duplicate_in_batch and already_in_list", async () => {
    listWatchlistMembersMock.mockResolvedValue([
      { symbol: "AAPL" },
    ]);

    searchSymbolSuggestionsMock.mockImplementation(async (query: string) => {
      if (query === "TSLA") {
        return {
          items: [{ symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", region: "US", type: "Equity" }],
          source: "yahoo",
        };
      }
      if (query === "AAPL") {
        return {
          items: [{ symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", region: "US", type: "Equity" }],
          source: "yahoo",
        };
      }
      return { items: [], source: "local-fallback" };
    });

    const result = await previewWatchlistImportSymbols("list-1", ["tsla", "tsla", "aapl"]);
    expect(result.items.map((item) => item.status)).toEqual([
      "matched",
      "duplicate_in_batch",
      "already_in_list",
    ]);
  });

  it("marks needs_choice when multiple candidates exist without exact", async () => {
    listWatchlistMembersMock.mockResolvedValue([]);
    searchSymbolSuggestionsMock.mockResolvedValue({
      items: [
        { symbol: "TESLA.MX", name: "Tesla Mexico", exchange: "MEX", region: "MX", type: "Equity" },
        { symbol: "TESLA.DE", name: "Tesla Germany", exchange: "XETRA", region: "DE", type: "Equity" },
      ],
      source: "yahoo",
    });

    const result = await previewWatchlistImportSymbols("list-1", ["tesla"]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe("needs_choice");
    expect(result.items[0]?.candidates).toHaveLength(2);
  });

  it("marks invalid_format and no_match", async () => {
    listWatchlistMembersMock.mockResolvedValue([]);
    searchSymbolSuggestionsMock.mockResolvedValue({
      items: [],
      source: "local-fallback",
    });

    const result = await previewWatchlistImportSymbols("list-1", ["ABC@@", "UNKNOWN"]);
    expect(result.items[0]?.status).toBe("invalid_format");
    expect(result.items[1]?.status).toBe("no_match");
  });
});
