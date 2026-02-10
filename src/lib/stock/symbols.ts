import { z } from "zod";

import {
  DEFAULT_MAX_QUERY_SYMBOLS,
  SYMBOL_PATTERN,
} from "@/lib/stock/constants";
import { InputError } from "@/lib/stock/errors";

const singleSymbolSchema = z
  .string()
  .trim()
  .min(1, "股票代码不能为空")
  .max(20, "股票代码长度不能超过 20 个字符");

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function validateSingleSymbol(rawSymbol: string): string {
  const parsedResult = singleSymbolSchema.safeParse(rawSymbol);
  if (!parsedResult.success) {
    throw new InputError(parsedResult.error.issues[0]?.message ?? "股票代码不合法");
  }
  const parsed = parsedResult.data;
  const symbol = normalizeSymbol(parsed);

  if (!SYMBOL_PATTERN.test(symbol)) {
    throw new InputError(`股票代码格式不合法: ${symbol}`);
  }

  return symbol;
}

export function parseSymbolsInput(
  rawSymbols: string,
  maxSymbols = DEFAULT_MAX_QUERY_SYMBOLS,
): string[] {
  const symbols = rawSymbols
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toUpperCase());

  if (symbols.length === 0) {
    throw new InputError("请至少输入一个股票代码");
  }

  const deduped = Array.from(new Set(symbols));

  if (deduped.length > maxSymbols) {
    throw new InputError(`单次最多支持查询 ${maxSymbols} 个股票代码`);
  }

  const invalidSymbols = deduped.filter((symbol) => !SYMBOL_PATTERN.test(symbol));
  if (invalidSymbols.length > 0) {
    throw new InputError(`以下股票代码格式不合法: ${invalidSymbols.join(", ")}`);
  }

  return deduped;
}
