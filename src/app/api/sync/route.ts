import { NextResponse } from "next/server";
import { fetchUpcomingEvents, classifyEvents } from "@/lib/luma";
import { writeCache, type CachedEvent, type CacheData } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const entries = await fetchUpcomingEvents();
    const classifications = await classifyEvents(entries);

    const events: CachedEvent[] = entries.map((entry) => {
      const { event } = entry;
      const classification = classifications[event.id] ?? {
        status: "none" as const,
        reason: "",
      };
      return {
        id: event.id,
        name: event.name,
        start_at: event.start_at,
        end_at: event.end_at,
        timezone: event.timezone,
        url: event.url,
        cover_url: event.cover_url,
        address: event.geo_address_json?.address ?? null,
        food_status: classification.status,
        food_reason: classification.reason,
      };
    });

    const cacheData: CacheData = {
      synced_at: new Date().toISOString(),
      events,
    };

    await writeCache(cacheData);

    return NextResponse.json(cacheData);
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
