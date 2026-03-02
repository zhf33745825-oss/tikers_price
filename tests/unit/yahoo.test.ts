import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildYahooSymbolCandidates,
  fetchHistoricalFromYahoo,
  fetchHistoricalFromYahooWithResolution,
  fetchQuoteMetadataFromYahoo,
  resetYahooRelayPreferenceForTests,
  resolveSymbolForYahoo,
  searchSymbolCandidatesFromYahoo,
} from "@/lib/stock/yahoo";

type MockResponseInput = {
  status: number;
  body: unknown;
  statusText?: string;
};

const originalFetch = globalThis.fetch;

function createMockResponse(input: MockResponseInput): Response {
  const body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  return new Response(body, {
    status: input.status,
    statusText: input.statusText ?? (input.status >= 200 && input.status < 300 ? "OK" : "ERROR"),
    headers: {
      "content-type": "application/json",
    },
  });
}

function mockFetchSequence(inputs: MockResponseInput[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const input of inputs) {
    fetchMock.mockResolvedValueOnce(createMockResponse(input));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function date(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`);
}

describe("yahoo chart adapter", () => {
  afterEach(() => {
    resetYahooRelayPreferenceForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds suffix candidates for known symbol patterns", () => {
    expect(buildYahooSymbolCandidates("PETR3")).toEqual(["PETR3", "PETR3.SA"]);
    expect(buildYahooSymbolCandidates("300750")).toEqual(["300750", "300750.SZ", "300750.SS"]);
    expect(buildYahooSymbolCandidates("WTC.AX")).toEqual(["WTC.AX"]);
  });

  it("resolves PETR3 to PETR3.SA for historical fetch", async () => {
    const fetchMock = mockFetchSequence([
      {
        status: 404,
        body: "Not Found",
      },
      {
        status: 200,
        body: {
          chart: {
            result: [
              {
                meta: {
                  symbol: "PETR3.SA",
                  currency: "BRL",
                },
                timestamp: [1735862400],
                indicators: {
                  quote: [{ close: [32.15] }],
                  adjclose: [{ adjclose: [32.01] }],
                },
              },
            ],
            error: null,
          },
        },
      },
    ]);

    const result = await fetchHistoricalFromYahooWithResolution(
      "PETR3",
      date("2025-01-01"),
      date("2025-01-15"),
    );

    expect(result.sourceSymbol).toBe("PETR3");
    expect(result.resolvedSymbol).toBe("PETR3.SA");
    expect(result.points).toHaveLength(1);
    expect(result.points[0].currency).toBe("BRL");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/PETR3.SA?");
  });

  it("prefers .SZ candidate for 6-digit China symbol", async () => {
    const fetchMock = mockFetchSequence([
      {
        status: 404,
        body: "Not Found",
      },
      {
        status: 200,
        body: {
          chart: {
            result: [
              {
                meta: {
                  symbol: "300750.SZ",
                  currency: "CNY",
                },
                timestamp: [1735862400],
                indicators: {
                  quote: [{ close: [168.21] }],
                },
              },
            ],
            error: null,
          },
        },
      },
    ]);

    const result = await fetchHistoricalFromYahooWithResolution(
      "300750",
      date("2025-01-01"),
      date("2025-01-31"),
    );

    expect(result.resolvedSymbol).toBe("300750.SZ");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/300750.SZ?");
  });

  it("keeps existing suffix symbol unchanged during resolve", async () => {
    const fetchMock = mockFetchSequence([
      {
        status: 200,
        body: {
          chart: {
            result: [
              {
                meta: {
                  symbol: "WTC.AX",
                  currency: "AUD",
                },
                timestamp: [],
                indicators: {
                  quote: [{ close: [] }],
                },
              },
            ],
            error: null,
          },
        },
      },
    ]);

    const resolved = await resolveSymbolForYahoo("WTC.AX");
    expect(resolved).toBe("WTC.AX");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/WTC.AX?");
  });

  it("parses quote metadata from chart meta", async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          chart: {
            result: [
              {
                meta: {
                  symbol: "PETR3.SA",
                  longName: "Petroleo Brasileiro",
                  exchangeName: "SAO",
                  currency: "BRL",
                },
                timestamp: [1735862400],
                indicators: {
                  quote: [{ close: [32.15] }],
                },
              },
            ],
            error: null,
          },
        },
      },
    ]);

    const meta = await fetchQuoteMetadataFromYahoo("PETR3");
    expect(meta.autoName).toBe("Petroleo Brasileiro");
    expect(meta.autoRegion).toBe("Brazil");
    expect(meta.autoCurrency).toBe("BRL");
  });

  it("falls back to relay endpoint when direct yahoo chart is blocked", async () => {
    const fetchMock = mockFetchSequence([
      {
        status: 403,
        body: "<html><body>blocked</body></html>",
      },
      {
        status: 200,
        body: `Title:\n\nURL Source: http://query2.finance.yahoo.com/v8/finance/chart/PETR3.SA\n\nMarkdown Content:\n{"chart":{"result":[{"meta":{"symbol":"PETR3.SA","currency":"BRL"},"timestamp":[1735862400],"indicators":{"quote":[{"close":[32.15]}]}}],"error":null}}`,
      },
    ]);

    const result = await fetchHistoricalFromYahooWithResolution(
      "PETR3.SA",
      date("2025-01-01"),
      date("2025-01-10"),
    );

    expect(result.resolvedSymbol).toBe("PETR3.SA");
    expect(result.points).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("r.jina.ai/http://query2.finance.yahoo.com");
  });

  it("normalizes html-like upstream failures to concise message", async () => {
    mockFetchSequence([
      {
        status: 503,
        body: "<html><body><script>alert('blocked')</script>Yahoo blocked</body></html>",
      },
      {
        status: 503,
        body: "<html><body>relay blocked</body></html>",
      },
    ]);

    await expect(
      fetchHistoricalFromYahoo("AAPL", date("2025-01-01"), date("2025-01-10")),
    ).rejects.toThrow(/Yahoo source unavailable/);
  });

  it("parses and ranks yahoo search suggestions", async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          quotes: [
            {
              symbol: "TSLA",
              quoteType: "EQUITY",
              typeDisp: "Equity",
              longname: "Tesla, Inc.",
              exchDisp: "NASDAQ",
            },
            {
              symbol: "^IXIC",
              quoteType: "INDEX",
              typeDisp: "Index",
              shortname: "NASDAQ Composite",
              exchDisp: "NASDAQ",
            },
            {
              symbol: "TSLAX",
              quoteType: "MUTUALFUND",
              typeDisp: "Mutual Fund",
              longname: "Example Fund",
              exchDisp: "NMFQS",
            },
            {
              symbol: "TSLA",
              quoteType: "EQUITY",
              typeDisp: "Equity",
              longname: "Tesla Duplicate",
              exchDisp: "NASDAQ",
            },
          ],
        },
      },
    ]);

    const suggestions = await searchSymbolCandidatesFromYahoo("TS", 3);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.symbol).toBe("TSLA");
    expect(suggestions[0]?.type).toBe("Equity");
    expect(suggestions.map((item) => item.symbol)).toEqual(["TSLA", "^IXIC", "TSLAX"]);
  });

  it("falls back to relay endpoint for yahoo search when direct endpoint is blocked", async () => {
    const fetchMock = mockFetchSequence([
      {
        status: 403,
        body: "<html><body>blocked</body></html>",
      },
      {
        status: 200,
        body: `Title:\n\nURL Source: http://query2.finance.yahoo.com/v1/finance/search\n\nMarkdown Content:\n{"quotes":[{"symbol":"AAPL","quoteType":"EQUITY","typeDisp":"Equity","longname":"Apple Inc.","exchDisp":"NASDAQ"}]}`,
      },
    ]);

    const suggestions = await searchSymbolCandidatesFromYahoo("AAP", 8);
    expect(suggestions[0]?.symbol).toBe("AAPL");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("r.jina.ai/http://query2.finance.yahoo.com");
  });
});
