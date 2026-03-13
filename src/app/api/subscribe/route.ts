import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.emailSubscribers.subscribe, {
      email: email.trim(),
    });

    if (!result.alreadySubscribed && resend) {
      try {
        await resend.emails.send({
          from: "FT Snacker <onboarding@resend.dev>",
          to: email.trim(),
          subject: "Welcome to FT Snacker!",
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0a;color:#EBEBEB;border-radius:12px;">
              <h2 style="margin:0 0 8px;color:#938DEE;">Welcome to FT Snacker!</h2>
              <p style="margin:0 0 16px;font-size:16px;">You'll get an email whenever free food or drinks are spotted at Frontier Tower.</p>
              <a href="https://www.ftsnacker.com" style="display:inline-block;padding:10px 20px;background:#764AE2;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Visit FT Snacker</a>
              <hr style="border:none;border-top:1px solid #2B2B2B;margin:24px 0 12px;" />
              <p style="margin:0;font-size:12px;color:#666;">FT Snacker - Free Food at Frontier Tower</p>
            </div>
          `,
        });
      } catch (err) {
        console.error("Welcome email failed:", err);
      }
    }

    return NextResponse.json({ ok: true, alreadySubscribed: result.alreadySubscribed });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
