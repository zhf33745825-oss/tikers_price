import { describe, expect, it } from "vitest";

import { getPendingSymbolsFromMatrix } from "@/components/stock-query-app";
import type { MatrixPriceResponse } from "@/types/stock";

function buildResponse(rows: MatrixPriceResponse["rows"]): MatrixPriceResponse {
  return {
    mode: "watchlist",
    range: {
      from: "2026-02-01",
      to: "2026-02-11",
      preset: "30",
    },
    dates: ["2026-02-11", "2026-02-10"],
    displayDates: ["26.02.11", "26.02.10"],
    rows,
    warnings: [],
  };
}

describe("getPendingSymbolsFromMatrix", () => {
  it("returns symbols that have no latest value and all matrix values are null", () => {
    const response = buildResponse([
      {
        symbol: "SNAP",
        name: "Snap Inc.",
        region: "US",
        currency: "USD",
        latestClose: null,
        pricesByDate: {
          "2026-02-11": null,
          "2026-02-10": null,
        },
      },
      {
        symbol: "WTC.AX",
        name: "WISETECH FPO [WTC]",
        region: "Australia",
        currency: "AUD",
        latestClose: 50.22,
        pricesByDate: {
          "2026-02-11": 50.22,
          "2026-02-10": 50.59,
        },
      },
    ]);

    expect(getPendingSymbolsFromMatrix(response)).toEqual(["SNAP"]);
  });

  it("returns empty list when row already has at least one usable value", () => {
    const response = buildResponse([
      {
        symbol: "PETR3.SA",
        name: "Petrobras",
        region: "Brazil",
        currency: "BRL",
        latestClose: null,
        pricesByDate: {
          "2026-02-11": 39.86,
          "2026-02-10": null,
        },
      },
    ]);

    expect(getPendingSymbolsFromMatrix(response)).toEqual([]);
  });
});
