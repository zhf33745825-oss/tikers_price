import { NextRequest, NextResponse } from "next/server";

import { InputError, toErrorMessage } from "@/lib/stock/errors";
import { getMatrixPriceData } from "@/lib/stock/matrix";

export async function GET(request: NextRequest) {
  try {
    const payload = await getMatrixPriceData({
      mode: request.nextUrl.searchParams.get("mode"),
      preset: request.nextUrl.searchParams.get("preset"),
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to"),
      symbols: request.nextUrl.searchParams.get("symbols"),
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `matrix query failed: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

