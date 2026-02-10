import { appEnv } from "@/lib/env";
import { bulkInsertWatchSymbols, countWatchSymbols } from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";

let bootstrapPromise: Promise<void> | null = null;

async function bootstrapWatchlist(): Promise<void> {
  const count = await countWatchSymbols();
  if (count > 0) {
    return;
  }

  const symbols = Array.from(
    new Set(
      appEnv.defaultWatchlist.map((symbol) => validateSingleSymbol(symbol)),
    ),
  );

  if (symbols.length === 0) {
    return;
  }

  await bulkInsertWatchSymbols(symbols);
}

export async function ensureDefaultWatchlist(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapWatchlist().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}

export async function runBootstrapWatchlistScript(): Promise<void> {
  await bootstrapWatchlist();
}

