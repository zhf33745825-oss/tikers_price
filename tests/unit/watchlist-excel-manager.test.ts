import { describe, expect, it } from "vitest";

import {
  insertDraftRowAtTarget,
  normalizeDraftSymbol,
  parseSymbolsFromBulkImportInput,
  parseSymbolsFromExcelInput,
  reorderDraftRowsByDrop,
  validateRowsBeforeSync,
} from "@/components/watchlist-excel-manager";

describe("watchlist excel manager helpers", () => {
  it("parses first column from excel-like multi-line paste", () => {
    const parsed = parseSymbolsFromExcelInput("tsla\tTesla\n0700.hk\tTencent\nTSLA\tdup");
    expect(parsed).toEqual(["TSLA", "0700.HK"]);
  });

  it("parses comma and whitespace separated input", () => {
    const parsed = parseSymbolsFromExcelInput("aapl, msft  600519.ss");
    expect(parsed).toEqual(["AAPL", "MSFT", "600519.SS"]);
  });

  it("keeps duplicates for bulk import input", () => {
    const parsed = parseSymbolsFromBulkImportInput("tsla\tTesla\n0700.hk\tTencent\nTSLA\tdup");
    expect(parsed).toEqual(["TSLA", "0700.HK", "TSLA"]);
  });

  it("normalizes user input to uppercase", () => {
    expect(normalizeDraftSymbol("  petr3.sa ")).toBe("PETR3.SA");
  });

  it("rejects rows with unresolved symbol selection before sync", () => {
    const result = validateRowsBeforeSync([
      {
        input: "TSLA",
        selectedSymbol: "TSLA",
        status: "saved",
      },
      {
        input: "BAD",
        selectedSymbol: null,
        status: "no_match",
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.symbols).toEqual([]);
    expect(result.message).toContain("尚未确认");
  });

  it("rejects duplicate selected symbols", () => {
    const result = validateRowsBeforeSync([
      {
        input: "TSLA",
        selectedSymbol: "TSLA",
        status: "saved",
      },
      {
        input: "tsla",
        selectedSymbol: "TSLA",
        status: "matched",
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("重复代码");
  });

  it("returns ordered symbol list when rows are valid", () => {
    const result = validateRowsBeforeSync([
      {
        input: "TSLA",
        selectedSymbol: "TSLA",
        status: "saved",
      },
      {
        input: "AAPL",
        selectedSymbol: "AAPL",
        status: "matched",
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.symbols).toEqual(["TSLA", "AAPL"]);
  });

  it("inserts an empty row before target row and keeps one tail placeholder", () => {
    const rows: Parameters<typeof insertDraftRowAtTarget>[0] = [
      {
        id: "row-1",
        input: "TSLA",
        normalized: "TSLA",
        persistedSymbol: "TSLA",
        selectedSymbol: "TSLA",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "row-2",
        input: "AAPL",
        normalized: "AAPL",
        persistedSymbol: "AAPL",
        selectedSymbol: "AAPL",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "placeholder",
        input: "",
        normalized: "",
        persistedSymbol: null,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "请输入代码",
        persisted: false,
        isPlaceholder: true,
      },
    ];

    const inserted = insertDraftRowAtTarget([...rows], "row-2", "before");
    expect(inserted).toHaveLength(4);
    expect(inserted[1]?.isPlaceholder).toBe(false);
    expect(inserted[1]?.input).toBe("");
    expect(inserted[3]?.isPlaceholder).toBe(true);
  });

  it("falls back to append when target row does not exist", () => {
    const rows: Parameters<typeof insertDraftRowAtTarget>[0] = [
      {
        id: "row-1",
        input: "TSLA",
        normalized: "TSLA",
        persistedSymbol: "TSLA",
        selectedSymbol: "TSLA",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "placeholder",
        input: "",
        normalized: "",
        persistedSymbol: null,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "请输入代码",
        persisted: false,
        isPlaceholder: true,
      },
    ];

    const inserted = insertDraftRowAtTarget([...rows], "missing-row", "after");
    expect(inserted).toHaveLength(3);
    expect(inserted[1]?.isPlaceholder).toBe(false);
    expect(inserted[2]?.isPlaceholder).toBe(true);
  });

  it("reorders rows to target before position and keeps one tail placeholder", () => {
    const rows: Parameters<typeof reorderDraftRowsByDrop>[0] = [
      {
        id: "row-1",
        input: "TSLA",
        normalized: "TSLA",
        persistedSymbol: "TSLA",
        selectedSymbol: "TSLA",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "row-2",
        input: "AAPL",
        normalized: "AAPL",
        persistedSymbol: "AAPL",
        selectedSymbol: "AAPL",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "row-3",
        input: "MSFT",
        normalized: "MSFT",
        persistedSymbol: "MSFT",
        selectedSymbol: "MSFT",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "placeholder",
        input: "",
        normalized: "",
        persistedSymbol: null,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "请输入代码",
        persisted: false,
        isPlaceholder: true,
      },
    ];

    const reordered = reorderDraftRowsByDrop(rows, "row-3", "row-1", "before");
    expect(reordered.map((item) => item.id)).toEqual(["row-3", "row-1", "row-2", "placeholder"]);
    expect(reordered[3]?.isPlaceholder).toBe(true);
  });

  it("reorders rows to target after position", () => {
    const rows: Parameters<typeof reorderDraftRowsByDrop>[0] = [
      {
        id: "row-1",
        input: "TSLA",
        normalized: "TSLA",
        persistedSymbol: "TSLA",
        selectedSymbol: "TSLA",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "row-2",
        input: "AAPL",
        normalized: "AAPL",
        persistedSymbol: "AAPL",
        selectedSymbol: "AAPL",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "placeholder",
        input: "",
        normalized: "",
        persistedSymbol: null,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "请输入代码",
        persisted: false,
        isPlaceholder: true,
      },
    ];

    const reordered = reorderDraftRowsByDrop(rows, "row-1", "row-2", "after");
    expect(reordered.map((item) => item.id)).toEqual(["row-2", "row-1", "placeholder"]);
  });

  it("returns original rows when target is invalid", () => {
    const rows: Parameters<typeof reorderDraftRowsByDrop>[0] = [
      {
        id: "row-1",
        input: "TSLA",
        normalized: "TSLA",
        persistedSymbol: "TSLA",
        selectedSymbol: "TSLA",
        selectedSuggestion: null,
        suggestions: [],
        status: "saved",
        message: "",
        persisted: true,
        isPlaceholder: false,
      },
      {
        id: "placeholder",
        input: "",
        normalized: "",
        persistedSymbol: null,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "请输入代码",
        persisted: false,
        isPlaceholder: true,
      },
    ];

    const reordered = reorderDraftRowsByDrop(rows, "row-1", "missing-row", "before");
    expect(reordered).toBe(rows);
  });
});
