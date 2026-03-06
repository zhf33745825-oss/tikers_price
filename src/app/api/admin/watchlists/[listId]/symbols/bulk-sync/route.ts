import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { getWatchlistById, syncWatchlistSymbols } from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";

interface RouteContext {
  params: Promise<{
    listId: string;
  }>;
}

const bulkSyncSchema = z.object({
  symbols: z.array(z.string()).min(1, "symbols cannot be empty").max(1000, "too many symbols"),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const payload = bulkSyncSchema.parse(await request.json());
    const normalizedSymbols = payload.symbols.map((symbol) => validateSingleSymbol(symbol));
    const result = await syncWatchlistSymbols(params.listId, normalizedSymbols);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to sync watchlist symbols: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
