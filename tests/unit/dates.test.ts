import { describe, expect, it } from "vitest";

import { buildDateRange, parseDateKeyToDate, toDateKey } from "@/lib/stock/dates";
import { InputError } from "@/lib/stock/errors";

describe("date range", () => {
  it("uses explicit from and to", () => {
    const range = buildDateRange("2024-01-01", "2024-12-31");
    expect(range.from).toBe("2024-01-01");
    expect(range.to).toBe("2024-12-31");
  });

  it("throws when from is after to", () => {
    expect(() => buildDateRange("2024-12-31", "2024-01-01")).toThrow(InputError);
  });

  it("converts date key round trip", () => {
    const key = "2024-06-03";
    expect(toDateKey(parseDateKeyToDate(key))).toBe(key);
  });
});

