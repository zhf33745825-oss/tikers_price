import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  InputError,
  isPrismaKnownRequestError,
  toErrorMessage,
} from "@/lib/stock/errors";
import {
  getWatchlistById,
  removeSymbolFromWatchlist,
  updateWatchSymbolOverrides,
} from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";

interface RouteContext {
  params: Promise<{
    listId: string;
    symbol: string;
  }>;
}

const updateWatchSymbolSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  regionOverride: z.string().max(100).nullable().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const symbol = validateSingleSymbol(decodeURIComponent(params.symbol));
    const payload = updateWatchSymbolSchema.parse(await request.json());
    const item = await updateWatchSymbolOverrides(symbol, payload);
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isPrismaKnownRequestError(error, "P2025")) {
      return NextResponse.json({ error: "symbol not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: `failed to update symbol: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const symbol = validateSingleSymbol(decodeURIComponent(params.symbol));
    const removed = await removeSymbolFromWatchlist(params.listId, symbol);
    if (!removed) {
      return NextResponse.json({ error: "symbol not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to delete symbol: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
