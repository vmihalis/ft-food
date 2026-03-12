import { NextResponse } from "next/server";
import { readCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const cache = await readCache();

  if (!cache) {
    return NextResponse.json(
      { events: [], synced_at: null },
    );
  }

  return NextResponse.json(cache);
}
