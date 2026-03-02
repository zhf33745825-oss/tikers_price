import { NextRequest, NextResponse } from "next/server";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { getWatchlistById } from "@/lib/stock/repository";
import { searchSymbolSuggestions } from "@/lib/stock/symbol-suggest";
import { validateSymbolQuery } from "@/lib/stock/symbols";
import type { SymbolSuggestResponse } from "@/types/stock";

interface RouteContext {
  params: Promise<{
    listId: string;
  }>;
}

function parseLimit(rawLimit: string | null): number {
  if (!rawLimit) {
    return 8;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InputError("limit must be a positive integer");
  }

  return Math.max(1, Math.min(20, parsed));
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const query = validateSymbolQuery(request.nextUrl.searchParams.get("q") ?? "");
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const result = await searchSymbolSuggestions(query, limit);

    const response: SymbolSuggestResponse = {
      items: result.items,
      source: result.source,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to search symbols: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
