import { NextResponse, type NextRequest } from "next/server";
import { getRepositoriesForUser } from "@/lib/repositories";
import { gameCreateSchema } from "@/lib/validation/schemas";
import { searchGames } from "@/lib/search";
import { apiError } from "@/lib/api/respond";
import { requireCurrentUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    const [games, sidebets, paytables] = await Promise.all([
      repos.games.list(),
      repos.sidebets.list(),
      repos.paytables.list(),
    ]);

    const search = request.nextUrl.searchParams.get("search") ?? "";
    const casino = request.nextUrl.searchParams.get("casino");
    const matched = searchGames(games, sidebets, paytables, search, casino);
    // The API returns plain Game rows (matching the Games tab schema exactly) so the response can be
    // cached directly into Dexie's `games` table; the search join is just used to decide inclusion.
    const matchedIds = new Set(matched.map((game) => game.game_id));
    const results = games.filter((game) => matchedIds.has(game.game_id));
    return NextResponse.json(results);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...rest } = body as Record<string, unknown> & { id?: unknown };
    const data = gameCreateSchema.parse(rest);
    const repos = await getRepositoriesForUser(await requireCurrentUser());
    const created = await repos.games.create(data, typeof id === "string" ? id : undefined);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
