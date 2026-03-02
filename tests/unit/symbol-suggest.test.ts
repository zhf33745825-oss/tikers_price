import { beforeEach, describe, expect, it, vi } from "vitest";

const searchLocalWatchSymbolsMock = vi.hoisted(() => vi.fn());
const searchSymbolCandidatesFromYahooMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stock/repository", () => ({
  searchLocalWatchSymbols: searchLocalWatchSymbolsMock,
}));

vi.mock("@/lib/stock/yahoo", () => ({
  searchSymbolCandidatesFromYahoo: searchSymbolCandidatesFromYahooMock,
}));

import { searchSymbolSuggestions } from "@/lib/stock/symbol-suggest";

describe("searchSymbolSuggestions", () => {
  beforeEach(() => {
    searchLocalWatchSymbolsMock.mockReset();
    searchSymbolCandidatesFromYahooMock.mockReset();
  });

  it("returns yahoo suggestions when upstream is available", async () => {
    searchSymbolCandidatesFromYahooMock.mockResolvedValue([
      {
        symbol: "TSLA",
        name: "Tesla, Inc.",
        exchange: "NASDAQ",
        region: "US",
        type: "Equity",
      },
    ]);

    const result = await searchSymbolSuggestions("TS", 8);

    expect(result.source).toBe("yahoo");
    expect(result.items).toHaveLength(1);
    expect(searchLocalWatchSymbolsMock).not.toHaveBeenCalled();
  });

  it("falls back to local suggestions when yahoo throws", async () => {
    searchSymbolCandidatesFromYahooMock.mockRejectedValue(new Error("upstream unavailable"));
    searchLocalWatchSymbolsMock.mockResolvedValue([
      {
        symbol: "TSLA",
        name: "Tesla, Inc.",
        exchange: null,
        region: "US",
        type: "LOCAL",
      },
    ]);

    const result = await searchSymbolSuggestions("TS", 8);

    expect(result.source).toBe("local-fallback");
    expect(result.items).toHaveLength(1);
    expect(searchLocalWatchSymbolsMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to local suggestions when yahoo returns empty", async () => {
    searchSymbolCandidatesFromYahooMock.mockResolvedValue([]);
    searchLocalWatchSymbolsMock.mockResolvedValue([]);

    const result = await searchSymbolSuggestions("ZZ", 8);

    expect(result.source).toBe("local-fallback");
    expect(result.items).toEqual([]);
  });
});
