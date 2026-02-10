import { describe, expect, it } from "vitest";

import { inferRegionFromExchange, inferRegionFromSymbol } from "@/lib/stock/region";

describe("region inference", () => {
  it("infers by ticker suffix", () => {
    expect(inferRegionFromSymbol("0700.HK")).toBe("Hong Kong");
    expect(inferRegionFromSymbol("600519.SS")).toBe("China");
    expect(inferRegionFromSymbol("AAPL")).toBe("US");
  });

  it("infers by exchange name when available", () => {
    expect(inferRegionFromExchange("NASDAQ Global Select", "AAPL")).toBe("US");
    expect(inferRegionFromExchange("Hong Kong", "0700.HK")).toBe("Hong Kong");
  });
});

