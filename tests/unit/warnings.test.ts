import { describe, expect, it } from "vitest";

import { filterHydrationWarningsByAvailableSymbols } from "@/lib/stock/warnings";

describe("filterHydrationWarningsByAvailableSymbols", () => {
  it("removes hydration warnings for symbols that already have local data", () => {
    const warnings = [
      "AAPL: failed to fetch missing historical data (Yahoo source unavailable)",
      "MSFT: failed to fetch missing historical data (Yahoo source unavailable)",
      "GOOGL: failed to refresh meta (fetch failed)",
    ];

    const filtered = filterHydrationWarningsByAvailableSymbols(
      warnings,
      new Set(["AAPL"]),
    );

    expect(filtered).toEqual([
      "MSFT: failed to fetch missing historical data (Yahoo source unavailable)",
      "GOOGL: failed to refresh meta (fetch failed)",
    ]);
  });
});
