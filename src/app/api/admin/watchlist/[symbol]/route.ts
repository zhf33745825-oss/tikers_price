import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { removeWatchSymbol } from "@/lib/stock/repository";
import { validateSingleSymbol } from "@/lib/stock/symbols";

interface RouteContext {
  params: Promise<{
    symbol: string;
  }>;
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const symbol = validateSingleSymbol(decodeURIComponent(params.symbol));
    await removeWatchSymbol(symbol);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2025"
    ) {
      return NextResponse.json({ error: "股票代码不存在" }, { status: 404 });
    }

    return NextResponse.json(
      { error: `删除清单失败: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

