import { fetchHistoricalFromYahoo } from "@/lib/stock/yahoo";
import { getPriceSeries, upsertDailyPrices } from "@/lib/stock/repository";
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

  for (const symbol of input.symbols) {
    try {
      const fetchedPoints = await fetchHistoricalFromYahoo(
        symbol,
        input.range.fromDate,
        input.range.toDate,
      );

      if (fetchedPoints.length > 0) {
        await upsertDailyPrices(symbol, fetchedPoints);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "拉取失败";
      warnings.push(`${symbol}: Yahoo Finance 拉取失败 (${message})`);
    }
  }

  const series = await getPriceSeries(
    input.symbols,
    input.range.fromDate,
    input.range.toDate,
  );
  const availableSymbols = new Set(series.map((item) => item.symbol));

  for (const symbol of input.symbols) {
    if (!availableSymbols.has(symbol)) {
      warnings.push(`${symbol}: 在所选时间范围内没有可用数据`);
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

