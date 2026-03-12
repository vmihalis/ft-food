import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      return { added: false };
    }

    await ctx.db.insert("subscribers", {
      email,
      subscribedAt: new Date().toISOString(),
    });
    return { added: true };
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("subscribers").collect();
    return subs.map((s) => s.email);
  },
});
