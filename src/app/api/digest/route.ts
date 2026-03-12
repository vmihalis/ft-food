import { NextResponse } from "next/server";
import { Resend } from "resend";
import { readCache } from "@/lib/cache";
import { readSubscribers } from "@/lib/subscribers";

export const dynamic = "force-dynamic";

function formatDate(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildDigestHtml(
  events: { name: string; start_at: string; end_at: string; timezone: string; url: string; food_status: string; food_reason: string }[]
): string {
  const foodEvents = events.filter((e) => e.food_status === "food");
  const drinkEvents = events.filter((e) => e.food_status === "drinks_only");

  if (foodEvents.length === 0 && drinkEvents.length === 0) {
    return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h1 style="font-size:24px;">🍕 Frontier Tower Daily Digest</h1>
      <p style="color:#666;">No free food or drink events today. Check back tomorrow!</p>
    </div>`;
  }

  let html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <h1 style="font-size:24px;">🍕 Frontier Tower Daily Digest</h1>
    <p style="color:#666;margin-bottom:24px;">Here's what's free today at 995 Market St:</p>`;

  if (foodEvents.length > 0) {
    html += `<h2 style="font-size:18px;color:#16a34a;">🍕 Free Food</h2>`;
    for (const e of foodEvents) {
      html += `<div style="border:1px solid #e5e7eb;border-left:4px solid #16a34a;border-radius:8px;padding:16px;margin-bottom:12px;">
        <a href="${e.url}" style="font-size:16px;font-weight:600;color:#111;text-decoration:none;">${e.name}</a>
        ${e.food_reason ? `<div style="font-size:15px;color:#16a34a;font-weight:600;margin-top:4px;">🍽️ ${e.food_reason}</div>` : ""}
        <div style="font-size:13px;color:#666;margin-top:4px;">${formatDate(e.start_at, e.timezone)}</div>
      </div>`;
    }
  }

  if (drinkEvents.length > 0) {
    html += `<h2 style="font-size:18px;color:#2563eb;">🍺 Free Drinks</h2>`;
    for (const e of drinkEvents) {
      html += `<div style="border:1px solid #e5e7eb;border-left:4px solid #2563eb;border-radius:8px;padding:16px;margin-bottom:12px;">
        <a href="${e.url}" style="font-size:16px;font-weight:600;color:#111;text-decoration:none;">${e.name}</a>
        ${e.food_reason ? `<div style="font-size:15px;color:#2563eb;font-weight:600;margin-top:4px;">🍹 ${e.food_reason}</div>` : ""}
        <div style="font-size:13px;color:#666;margin-top:4px;">${formatDate(e.start_at, e.timezone)}</div>
      </div>`;
    }
  }

  html += `<p style="color:#999;font-size:12px;margin-top:24px;">Frontier Tower Free Food Finder · 995 Market St, SF</p></div>`;
  return html;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const resend = new Resend(resendKey);
    const cache = await readCache();
    const subs = await readSubscribers();

    if (subs.emails.length === 0) {
      return NextResponse.json({ ok: true, message: "No subscribers" });
    }

    if (!cache || cache.events.length === 0) {
      return NextResponse.json({ ok: true, message: "No events cached" });
    }

    // Filter to today's events (in SF timezone)
    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
    const todayEvents = cache.events.filter((e) => {
      const eventDay = new Date(e.start_at).toLocaleDateString("en-US", { timeZone: e.timezone || "America/Los_Angeles" });
      return eventDay === today;
    });

    const html = buildDigestHtml(todayEvents);
    const fromEmail = process.env.FROM_EMAIL || "digest@updates.example.com";

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: subs.emails,
      subject: `🍕 Free Food Today at Frontier Tower`,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sent_to: subs.emails.length,
      events_today: todayEvents.length,
    });
  } catch (error) {
    console.error("Digest error:", error);
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
