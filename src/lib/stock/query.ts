import { hydrateHistoricalCacheForSymbols } from "@/lib/stock/cache-hydration";
import { getPriceSeries } from "@/lib/stock/repository";
import { filterHydrationWarningsByAvailableSymbols } from "@/lib/stock/warnings";
import type { DateRange } from "@/lib/stock/dates";
import type { PriceQueryResponse } from "@/types/stock";

interface QueryHistoricalSeriesInput {
  symbols: string[];
  range: DateRange;
}

export async function queryHistoricalSeries(
  input: QueryHistoricalSeriesInput,
): Promise<PriceQueryResponse> {
  const warnings: string[] = [];

  await hydrateHistoricalCacheForSymbols({
    symbols: input.symbols,
    fromDate: input.range.fromDate,
    toDate: input.range.toDate,
    warnings,
  });

  const series = await getPriceSeries(
    input.symbols,
    input.range.fromDate,
    input.range.toDate,
  );
  const availableSymbols = new Set(series.map((item) => item.symbol));
  const filteredWarnings = filterHydrationWarningsByAvailableSymbols(
    warnings,
    new Set(Array.from(availableSymbols, (symbol) => symbol.toUpperCase())),
  );

  for (const symbol of input.symbols) {
    if (!availableSymbols.has(symbol)) {
      filteredWarnings.push(`${symbol}: no data found in selected range`);
    }
  }

  return {
    range: {
      from: input.range.from,
      to: input.range.to,
    },
    series,
    warnings: Array.from(new Set(filteredWarnings)),
  };
}
