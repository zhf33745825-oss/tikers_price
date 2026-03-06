import { InputError } from "@/lib/stock/errors";
import { listWatchlistMembers } from "@/lib/stock/repository";
import { searchSymbolSuggestions } from "@/lib/stock/symbol-suggest";
import { validateSingleSymbol } from "@/lib/stock/symbols";
import type { ImportPreviewResponse, ImportPreviewRow, SymbolSuggestion } from "@/types/stock";

function pickAutoSuggestion(
  normalized: string,
  suggestions: SymbolSuggestion[],
): SymbolSuggestion | null {
  const exact = suggestions.find((item) => item.symbol === normalized);
  if (exact) {
    return exact;
  }
  if (suggestions.length === 1) {
    return suggestions[0] ?? null;
  }
  return null;
}

export async function previewWatchlistImportSymbols(
  listId: string,
  inputSymbols: string[],
  limit = 8,
): Promise<ImportPreviewResponse> {
  if (inputSymbols.length === 0) {
    return { items: [] };
  }

  const normalizedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  if (!Number.isFinite(normalizedLimit)) {
    throw new InputError("invalid limit");
  }

  const existingItems = await listWatchlistMembers(listId);
  const existingSymbolSet = new Set(existingItems.map((item) => item.symbol));
  const batchResolvedSet = new Set<string>();

  const items: ImportPreviewRow[] = [];

  for (const rawInput of inputSymbols) {
    const input = (rawInput ?? "").trim();
    const normalized = input.toUpperCase();

    if (!normalized) {
      continue;
    }

    try {
      validateSingleSymbol(normalized);
    } catch {
      items.push({
        input,
        normalized,
        status: "invalid_format",
        message: `代码格式不正确：${normalized}`,
        resolvedSymbol: null,
        candidates: [],
      });
      continue;
    }

    let suggestions: SymbolSuggestion[];
    try {
      const result = await searchSymbolSuggestions(normalized, normalizedLimit);
      suggestions = result.items;
    } catch {
      suggestions = [];
    }

    if (suggestions.length === 0) {
      items.push({
        input,
        normalized,
        status: "no_match",
        message: `未找到匹配代码：${normalized}`,
        resolvedSymbol: null,
        candidates: [],
      });
      continue;
    }

    const autoSuggestion = pickAutoSuggestion(normalized, suggestions);
    if (!autoSuggestion) {
      items.push({
        input,
        normalized,
        status: "needs_choice",
        message: `存在多个候选，请手动选择：${normalized}`,
        resolvedSymbol: null,
        candidates: suggestions,
      });
      continue;
    }

    const resolvedSymbol = autoSuggestion.symbol;
    if (existingSymbolSet.has(resolvedSymbol)) {
      items.push({
        input,
        normalized,
        status: "already_in_list",
        message: `已在当前清单：${resolvedSymbol}`,
        resolvedSymbol,
        candidates: suggestions,
      });
      continue;
    }

    if (batchResolvedSet.has(resolvedSymbol)) {
      items.push({
        input,
        normalized,
        status: "duplicate_in_batch",
        message: `批量中重复代码：${resolvedSymbol}`,
        resolvedSymbol,
        candidates: suggestions,
      });
      continue;
    }

    batchResolvedSet.add(resolvedSymbol);
    items.push({
      input,
      normalized,
      status: "matched",
      message: resolvedSymbol === normalized ? "精确匹配" : `已匹配到 ${resolvedSymbol}`,
      resolvedSymbol,
      candidates: suggestions,
    });
  }

  return { items };
}
