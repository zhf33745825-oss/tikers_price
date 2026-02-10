import { z } from "zod";

import {
  DEFAULT_MAX_QUERY_SYMBOLS,
  DEFAULT_WATCHLIST_SYMBOLS,
} from "@/lib/stock/constants";

const envSchema = z.object({
  UPDATE_API_TOKEN: z.string().optional(),
  DEFAULT_WATCHLIST: z.string().optional(),
  MAX_QUERY_SYMBOLS: z.string().optional(),
});

const parsed = envSchema.parse({
  UPDATE_API_TOKEN: process.env.UPDATE_API_TOKEN,
  DEFAULT_WATCHLIST: process.env.DEFAULT_WATCHLIST,
  MAX_QUERY_SYMBOLS: process.env.MAX_QUERY_SYMBOLS,
});

function parseMaxQuerySymbols(value: string | undefined): number {
  if (!value) {
    return DEFAULT_MAX_QUERY_SYMBOLS;
  }
  const parsedValue = Number(value);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return DEFAULT_MAX_QUERY_SYMBOLS;
  }
  return Math.floor(parsedValue);
}

function parseDefaultWatchlist(value: string | undefined): string[] {
  if (!value?.trim()) {
    return DEFAULT_WATCHLIST_SYMBOLS;
  }
  return value
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

export const appEnv = {
  updateApiToken: parsed.UPDATE_API_TOKEN?.trim() || "",
  maxQuerySymbols: parseMaxQuerySymbols(parsed.MAX_QUERY_SYMBOLS),
  defaultWatchlist: parseDefaultWatchlist(parsed.DEFAULT_WATCHLIST),
};

