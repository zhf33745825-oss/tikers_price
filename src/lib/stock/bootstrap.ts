import { appEnv } from "@/lib/env";
import { DEFAULT_WATCHLIST_NAME } from "@/lib/stock/constants";
import {
  bulkInsertWatchSymbols,
  countWatchlistMembers,
  countWatchlists,
  createWatchlist,
  getDefaultWatchlist,
  listWatchlists,
  setDefaultWatchlist,
} from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";

let bootstrapPromise: Promise<void> | null = null;

async function bootstrapWatchlist(): Promise<void> {
  const watchlistCount = await countWatchlists();
  if (watchlistCount === 0) {
    await createWatchlist(DEFAULT_WATCHLIST_NAME);
  } else {
    const defaultWatchlist = await getDefaultWatchlist();
    if (!defaultWatchlist) {
      const lists = await listWatchlists();
      const fallbackList = lists[0];
      if (fallbackList) {
        await setDefaultWatchlist(fallbackList.id);
      }
    }
  }

  const memberCount = await countWatchlistMembers();
  if (memberCount > 0) {
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
