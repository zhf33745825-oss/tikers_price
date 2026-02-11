import { scheduleAsyncTailRefreshForSymbols } from "@/lib/stock/cache-hydration";
import { getPriceSeries } from "@/lib/stock/repository";
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

  const series = await getPriceSeries(
    input.symbols,
    input.range.fromDate,
    input.range.toDate,
  );

  if (process.env.NODE_ENV === "development") {
    const pointCount = series.reduce((sum, item) => sum + item.points.length, 0);
    console.info(
      `[db-hit] source=query symbols=${input.symbols.length} series=${series.length} points=${pointCount}`,
    );
  }

  scheduleAsyncTailRefreshForSymbols({
    source: "query",
    symbols: input.symbols,
    fromDate: input.range.fromDate,
    toDate: input.range.toDate,
  });

  const availableSymbols = new Set(series.map((item) => item.symbol));

  for (const symbol of input.symbols) {
    if (!availableSymbols.has(symbol)) {
      warnings.push(`${symbol}: no data found in selected range`);
    }
  }

  return {
    range: {
      from: input.range.from,
      to: input.range.to,
    },
    series,
    warnings: Array.from(new Set(warnings)),
  };
}
