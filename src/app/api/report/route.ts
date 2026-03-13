import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { sendPushToAll } from "@/lib/push";
import { sendEmailToAll } from "@/lib/email";

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

    try {
      const eventUrl = event?.url || "https://ftsnacker.com";
      await sendEmailToAll({
        subject: `${emoji} ${label} spotted at Frontier Tower!`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0a;color:#EBEBEB;border-radius:12px;">
            <h2 style="margin:0 0 8px;color:#938DEE;">${emoji} ${label} spotted!</h2>
            <p style="margin:0 0 16px;font-size:16px;">${body}</p>
            <a href="${eventUrl}" style="display:inline-block;padding:10px 20px;background:#764AE2;color:white;text-decoration:none;border-radius:8px;font-weight:600;">View Event</a>
            <hr style="border:none;border-top:1px solid #2B2B2B;margin:24px 0 12px;" />
            <p style="margin:0;font-size:12px;color:#666;">FT Snacker - Free Food at Frontier Tower</p>
          </div>
        `,
      });
    } catch (err) {
      console.error("Email notification failed:", err);
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
