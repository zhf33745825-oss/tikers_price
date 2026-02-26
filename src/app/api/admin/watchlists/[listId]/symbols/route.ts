import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import {
  addSymbolToWatchlist,
  getWatchlistById,
  listWatchlistMembers,
} from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";
import type { WatchlistMembersResponse } from "@/types/stock";

interface RouteContext {
  params: Promise<{
    listId: string;
  }>;
}

const createWatchSymbolSchema = z.object({
  symbol: z.string().min(1, "symbol is required"),
  displayName: z.string().max(100).optional(),
  regionOverride: z.string().max(100).optional(),
});

export async function GET(_: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const items = await listWatchlistMembers(params.listId);
    const response: WatchlistMembersResponse = {
      list,
      items,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: `failed to load watchlist members: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const payload = createWatchSymbolSchema.parse(await request.json());
    const symbol = validateSingleSymbol(payload.symbol);
    const item = await addSymbolToWatchlist(
      params.listId,
      symbol,
      payload.displayName,
      payload.regionOverride,
    );

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to add symbol: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
