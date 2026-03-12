import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/subscribers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const added = await addSubscriber(email);

    return NextResponse.json({
      ok: true,
      message: added ? "Subscribed! You'll get daily updates." : "You're already subscribed!",
    });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
