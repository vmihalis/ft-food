import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { event_id, type, description, reporter_name } = await req.json();

    if (!event_id || !type) {
      return NextResponse.json(
        { error: "event_id and type required" },
        { status: 400 }
      );
    }

    if (type !== "food" && type !== "drinks") {
      return NextResponse.json(
        { error: "type must be 'food' or 'drinks'" },
        { status: 400 }
      );
    }

    const trimmedName = reporter_name?.trim().slice(0, 50) || undefined;

    await convex.mutation(api.reports.add, {
      eventId: event_id,
      type,
      description: description?.slice(0, 200) || "",
      reporterName: trimmedName,
    });

    // Find event name for the notification
    const { events } = await convex.query(api.events.list);
    const event = events.find((e: { id: string }) => e.id === event_id);
    const eventName = event?.name || "an event";

    const emoji = type === "food" ? "\u{1F355}" : "\u{1F37A}";
    const label = type === "food" ? "Free food" : "Free drinks";
    const spottedBy = trimmedName ? ` (spotted by ${trimmedName})` : "";
    const body = description
      ? `${description} at ${eventName}${spottedBy}`
      : `${label} spotted at ${eventName}${spottedBy}`;

    try {
      await sendPushToAll({
        title: `${emoji} ${label} spotted!`,
        body,
        url: event?.url || "/",
      });
    } catch (err) {
      console.error("Push notification failed:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 }
    );
  }
}
