import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureDefaultWatchlist } from "@/lib/stock/bootstrap";
import { InputError, isPrismaKnownRequestError, toErrorMessage } from "@/lib/stock/errors";
import {
  createWatchlist,
  getDefaultWatchlist,
  getLastSuccessfulUpdateAt,
  getWatchlistById,
  listWatchlists,
} from "@/lib/stock/repository";
import type { WatchlistsResponse } from "@/types/stock";

const createWatchlistSchema = z.object({
  name: z.string().min(1, "name is required").max(100, "name is too long"),
});

export async function GET() {
  try {
    await ensureDefaultWatchlist();

    const [lists, defaultWatchlist, lastSuccessfulUpdateAt] = await Promise.all([
      listWatchlists(),
      getDefaultWatchlist(),
      getLastSuccessfulUpdateAt(),
    ]);

    const response: WatchlistsResponse = {
      lists,
      defaultListId: defaultWatchlist?.id ?? null,
      lastSuccessfulUpdateAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: `failed to load watchlists: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createWatchlistSchema.parse(await request.json());
    const created = await createWatchlist(payload.name);
    const item = await getWatchlistById(created.id);

    if (!item) {
      return NextResponse.json({ error: "watchlist created but not found" }, { status: 500 });
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "invalid payload" }, { status: 400 });
    }
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isPrismaKnownRequestError(error, "P2002")) {
      return NextResponse.json({ error: "watchlist name already exists" }, { status: 409 });
    }

    return NextResponse.json(
      { error: `failed to create watchlist: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
