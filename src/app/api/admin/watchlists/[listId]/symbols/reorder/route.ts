import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { getWatchlistById, moveWatchlistMember } from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";

interface RouteContext {
  params: Promise<{
    listId: string;
  }>;
}

const reorderSchema = z.object({
  symbol: z.string().min(1, "symbol is required"),
  direction: z.enum(["up", "down"]),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const payload = reorderSchema.parse(await request.json());
    const symbol = validateSingleSymbol(payload.symbol);
    const moved = await moveWatchlistMember(params.listId, symbol, payload.direction);

    return NextResponse.json({ ok: true, moved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to reorder symbols: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
