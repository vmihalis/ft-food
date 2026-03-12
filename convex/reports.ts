import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db.query("reports").collect();
    return {
      reports: reports.map((r) => ({
        event_id: r.eventId,
        type: r.type,
        description: r.description,
        reported_at: r.reportedAt,
      })),
    };
  },
});

export const add = mutation({
  args: {
    eventId: v.string(),
    type: v.union(v.literal("food"), v.literal("drinks")),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("reports", {
      eventId: args.eventId,
      type: args.type,
      description: args.description,
      reportedAt: new Date().toISOString(),
    });
  },
});
