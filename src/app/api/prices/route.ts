import { NextRequest, NextResponse } from "next/server";

import { appEnv } from "@/lib/env";
import { buildDateRange } from "@/lib/stock/dates";
import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { queryHistoricalSeries } from "@/lib/stock/query";
import { parseSymbolsInput } from "@/lib/stock/symbols";

export async function GET(request: NextRequest) {
  try {
    const rawSymbols = request.nextUrl.searchParams.get("symbols") ?? "";
    const rawFrom = request.nextUrl.searchParams.get("from");
    const rawTo = request.nextUrl.searchParams.get("to");

    const symbols = parseSymbolsInput(rawSymbols, appEnv.maxQuerySymbols);
    const range = buildDateRange(rawFrom, rawTo);
    const payload = await queryHistoricalSeries({ symbols, range });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `历史数据查询失败: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

