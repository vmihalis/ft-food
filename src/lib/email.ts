import { Resend } from "resend";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return null;
  }
  return new Resend(key);
}

const FROM_EMAIL = "FT Snacker <onboarding@resend.dev>";

export async function sendEmailToAll(payload: {
  subject: string;
  html: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("Resend API key not configured, skipping email notifications");
    return;
  }

  const subscribers = await convex.query(api.emailSubscribers.listAll);
  if (subscribers.length === 0) return;

  const emails = subscribers.map(
    (s: { email: string }) => s.email
  );

  // Resend supports batch sending up to 100 per call
  const batches: string[][] = [];
  for (let i = 0; i < emails.length; i += 100) {
    batches.push(emails.slice(i, i + 100));
  }

  await Promise.allSettled(
    batches.map((batch) =>
      resend.batch.send(
        batch.map((email) => ({
          from: FROM_EMAIL,
          to: email,
          subject: payload.subject,
          html: payload.html,
        }))
      )
    )
  );
}
