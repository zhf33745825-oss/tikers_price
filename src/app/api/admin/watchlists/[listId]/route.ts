import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { InputError, isPrismaKnownRequestError, toErrorMessage } from "@/lib/stock/errors";
import {
  deleteWatchlist,
  getWatchlistById,
  renameWatchlist,
  setDefaultWatchlist,
} from "@/lib/stock/repository";

interface RouteContext {
  params: Promise<{
    listId: string;
  }>;
}

const updateWatchlistSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const listId = params.listId;
    const payload = updateWatchlistSchema.parse(await request.json());

    if (payload.name === undefined && payload.isDefault === undefined) {
      return NextResponse.json({ error: "no changes provided" }, { status: 400 });
    }

    if (payload.name !== undefined) {
      const renamed = await renameWatchlist(listId, payload.name);
      if (!renamed) {
        return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
      }
    }

    if (payload.isDefault === true) {
      const updated = await setDefaultWatchlist(listId);
      if (!updated) {
        return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
      }
    }

    const item = await getWatchlistById(listId);
    if (!item) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    return NextResponse.json(item);
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
      { error: `failed to update watchlist: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const result = await deleteWatchlist(params.listId);

    if (!result.deleted) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, nextDefaultListId: result.nextDefaultListId });
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `failed to delete watchlist: ${toErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
