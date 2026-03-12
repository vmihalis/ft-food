import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
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
    syncedAt: v.string(),
  }).index("by_eventId", ["eventId"]),

  reports: defineTable({
    eventId: v.string(),
    type: v.union(v.literal("food"), v.literal("drinks")),
    description: v.string(),
    reportedAt: v.string(),
  }).index("by_eventId", ["eventId"]),

  pushSubscriptions: defineTable({
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  }).index("by_endpoint", ["endpoint"]),

  syncMeta: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
