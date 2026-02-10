import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureDefaultWatchlist } from "@/lib/stock/bootstrap";
import { InputError, toErrorMessage } from "@/lib/stock/errors";
import {
  addWatchSymbol,
  getLastSuccessfulUpdateAt,
  listWatchSymbols,
} from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";
import type { WatchlistResponse } from "@/types/stock";

const createWatchSymbolSchema = z.object({
  symbol: z.string().min(1, "symbol 不能为空"),
  displayName: z.string().max(100).optional(),
});

export async function GET() {
  try {
    await ensureDefaultWatchlist();

    const [items, lastSuccessfulUpdateAt] = await Promise.all([
      listWatchSymbols(),
      getLastSuccessfulUpdateAt(),
    ]);

    const response: WatchlistResponse = {
      items,
      lastSuccessfulUpdateAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: `读取清单失败: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createWatchSymbolSchema.parse(await request.json());
    const symbol = validateSingleSymbol(payload.symbol);
    const item = await addWatchSymbol(symbol, payload.displayName);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "参数错误" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `新增清单失败: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

