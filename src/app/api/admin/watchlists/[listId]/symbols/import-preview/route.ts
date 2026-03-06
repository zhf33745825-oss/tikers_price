import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { getWatchlistById } from "@/lib/stock/repository";
import { previewWatchlistImportSymbols } from "@/lib/stock/symbol-import";
import type { ImportPreviewResponse } from "@/types/stock";

interface RouteContext {
  params: Promise<{
    listId: string;
  }>;
}

const importPreviewSchema = z.object({
  symbols: z.array(z.string()).min(1, "symbols cannot be empty").max(1000, "too many symbols"),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const list = await getWatchlistById(params.listId);
    if (!list) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const payload = importPreviewSchema.parse(await request.json());
    const result = await previewWatchlistImportSymbols(
      params.listId,
      payload.symbols,
      payload.limit ?? 8,
    );

    const response: ImportPreviewResponse = {
      items: result.items,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to preview import symbols: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
