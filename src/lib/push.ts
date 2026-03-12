import webpush from "web-push";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function getVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:hello@example.com";

  if (!publicKey || !privateKey) {
    return null;
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  return webpush;
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  const wp = getVapid();
  if (!wp) {
    console.warn("VAPID keys not configured, skipping push notifications");
    return;
  }

  const subscriptions = await convex.query(api.pushSubscriptions.listAll);
  const json = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          json
        );
      } catch (err: unknown) {
        if (err && typeof err === "object" && "statusCode" in err) {
          const statusCode = (err as { statusCode: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await convex.mutation(api.pushSubscriptions.remove, {
              endpoint: sub.endpoint,
            });
          }
        }
      }
    })
  );
}
