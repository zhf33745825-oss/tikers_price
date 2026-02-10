import { describe, expect, it } from "vitest";

import { InputError } from "@/lib/stock/errors";
import { parseSymbolsInput, validateSingleSymbol } from "@/lib/stock/symbols";

describe("symbols parser", () => {
  it("parses symbols separated by commas spaces and newlines", () => {
    const parsed = parseSymbolsInput("aapl, msft\n0700.hk  9988.hk");
    expect(parsed).toEqual(["AAPL", "MSFT", "0700.HK", "9988.HK"]);
  });

  it("deduplicates symbols and keeps order", () => {
    const parsed = parseSymbolsInput("AAPL, aapl, MSFT, AAPL");
    expect(parsed).toEqual(["AAPL", "MSFT"]);
  });

  it("throws for too many symbols", () => {
    const overLimit = new Array(21).fill("AAPL").map((value, idx) => `${value}${idx}`).join(",");
    expect(() => parseSymbolsInput(overLimit, 20)).toThrow(InputError);
  });

  it("throws for invalid symbol", () => {
    expect(() => validateSingleSymbol("AAPL$")).toThrow(InputError);
  });
});

