import { NextRequest, NextResponse } from "next/server";

import { appEnv } from "@/lib/env";
import { toErrorMessage } from "@/lib/stock/errors";
import { runDailyUpdate } from "@/lib/stock/update";

function isAuthorized(request: NextRequest): boolean {
  if (!appEnv.updateApiToken) {
    return true;
  }
  const token = request.headers.get("x-update-token");
  return token === appEnv.updateApiToken;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyUpdate();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `每日更新失败: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

