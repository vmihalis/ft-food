import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { fetchUpcomingEvents, classifyEvents } from "@/lib/luma";

export const dynamic = "force-dynamic";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sync();
}

export async function POST() {
  return sync();
}

async function sync() {
  try {
    const entries = await fetchUpcomingEvents();
    const classifications = await classifyEvents(entries);

    const syncedAt = new Date().toISOString();

    const events = entries.map((entry) => {
      const { event } = entry;
      const classification = classifications[event.id] ?? {
        status: "none" as const,
        reason: "",
      };
      return {
        eventId: event.id,
        name: event.name,
        startAt: event.start_at,
        endAt: event.end_at,
        timezone: event.timezone,
        url: event.url,
        coverUrl: event.cover_url,
        address: event.geo_address_json?.address ?? undefined,
        foodStatus: classification.status,
        foodReason: classification.reason,
      };
    });

    await convex.mutation(api.events.replaceAll, { events, syncedAt });

    const data = await convex.query(api.events.list);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
