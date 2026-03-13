import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

export const dynamic = "force-dynamic";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    return NextResponse.json({ ok: true, alreadySubscribed: result.alreadySubscribed });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
