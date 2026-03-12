import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    const meta = await ctx.db
      .query("syncMeta")
      .withIndex("by_key", (q) => q.eq("key", "synced_at"))
      .first();

    return {
      events: events
        .map((e) => ({
          id: e.eventId,
          name: e.name,
          start_at: e.startAt,
          end_at: e.endAt,
          timezone: e.timezone,
          url: e.url,
          cover_url: e.coverUrl,
          address: e.address ?? null,
          food_status: e.foodStatus,
          food_reason: e.foodReason,
        }))
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        ),
      synced_at: meta?.value ?? null,
    };
  },
});

export const replaceAll = mutation({
  args: {
    events: v.array(
      v.object({
        eventId: v.string(),
        name: v.string(),
        startAt: v.string(),
        endAt: v.string(),
        timezone: v.string(),
        url: v.string(),
        coverUrl: v.string(),
        address: v.optional(v.string()),
        foodStatus: v.union(
          v.literal("food"),
          v.literal("drinks_only"),
          v.literal("none")
        ),
        foodReason: v.string(),
      })
    ),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    // Delete all existing events
    const existing = await ctx.db.query("events").collect();
    for (const e of existing) {
      await ctx.db.delete(e._id);
    }

    // Insert new events
    for (const event of args.events) {
      await ctx.db.insert("events", {
        ...event,
        syncedAt: args.syncedAt,
      });
    }

    // Update sync timestamp
    const meta = await ctx.db
      .query("syncMeta")
      .withIndex("by_key", (q) => q.eq("key", "synced_at"))
      .first();

    if (meta) {
      await ctx.db.patch(meta._id, { value: args.syncedAt });
    } else {
      await ctx.db.insert("syncMeta", {
        key: "synced_at",
        value: args.syncedAt,
      });
    }
  },
});
