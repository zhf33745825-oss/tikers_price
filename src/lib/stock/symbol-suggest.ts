import { searchLocalWatchSymbols } from "@/lib/stock/repository";
import { searchSymbolCandidatesFromYahoo } from "@/lib/stock/yahoo";
import type { SymbolSuggestion } from "@/types/stock";

export interface SymbolSuggestResult {
  items: SymbolSuggestion[];
  source: "yahoo" | "local-fallback";
}

export async function searchSymbolSuggestions(
  query: string,
  limit: number,
): Promise<SymbolSuggestResult> {
  try {
    const yahooSuggestions = await searchSymbolCandidatesFromYahoo(query, limit);
    if (yahooSuggestions.length > 0) {
      return {
        items: yahooSuggestions,
        source: "yahoo",
      };
    }
  } catch {
    // Fallback to local candidates when upstream search is unavailable.
  }

  const localSuggestions = await searchLocalWatchSymbols(query, limit);
  return {
    items: localSuggestions,
    source: "local-fallback",
  };
}
