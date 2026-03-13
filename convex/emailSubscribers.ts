import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const subscribe = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // Check if already subscribed
    const existing = await ctx.db
      .query("emailSubscribers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      return { alreadySubscribed: true };
    }

    await ctx.db.insert("emailSubscribers", {
      email,
      subscribedAt: new Date().toISOString(),
    });

    return { alreadySubscribed: false };
  },
});
