import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (!existing) {
      await ctx.db.insert("pushSubscriptions", {
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
      });
    }
  },
});

export const remove = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (sub) {
      await ctx.db.delete(sub._id);
    }
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("pushSubscriptions").collect();
    return subs.map((s) => ({
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    }));
  },
});
