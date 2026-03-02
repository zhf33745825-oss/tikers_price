import { z } from "zod";

import {
  DEFAULT_MAX_QUERY_SYMBOLS,
  SYMBOL_PATTERN,
} from "@/lib/stock/constants";
import { InputError } from "@/lib/stock/errors";

const singleSymbolSchema = z
  .string()
  .trim()
  .min(1, "symbol is required")
  .max(20, "symbol length cannot exceed 20");

const symbolQuerySchema = z
  .string()
  .trim()
  .min(2, "query length must be at least 2")
  .max(20, "query length cannot exceed 20");

const SYMBOL_QUERY_PATTERN = /^[A-Z0-9.^=-]+$/;

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function validateSingleSymbol(rawSymbol: string): string {
  const parsedResult = singleSymbolSchema.safeParse(rawSymbol);
  if (!parsedResult.success) {
    throw new InputError(parsedResult.error.issues[0]?.message ?? "invalid symbol");
  }
  const parsed = parsedResult.data;
  const symbol = normalizeSymbol(parsed);

  if (!SYMBOL_PATTERN.test(symbol)) {
    throw new InputError(`invalid symbol format: ${symbol}`);
  }

  return symbol;
}

export function validateSymbolQuery(rawQuery: string): string {
  const parsedResult = symbolQuerySchema.safeParse(rawQuery);
  if (!parsedResult.success) {
    throw new InputError(parsedResult.error.issues[0]?.message ?? "invalid query");
  }

  const query = normalizeSymbol(parsedResult.data);
  if (!SYMBOL_QUERY_PATTERN.test(query)) {
    throw new InputError(`invalid query format: ${query}`);
  }

  return query;
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
    throw new InputError("please provide at least one symbol");
  }

  const deduped = Array.from(new Set(symbols));

  if (deduped.length > maxSymbols) {
    throw new InputError(`at most ${maxSymbols} symbols are allowed per request`);
  }

  const invalidSymbols = deduped.filter((symbol) => !SYMBOL_PATTERN.test(symbol));
  if (invalidSymbols.length > 0) {
    throw new InputError(`invalid symbol format: ${invalidSymbols.join(", ")}`);
  }

  return deduped;
}
