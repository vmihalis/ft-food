import fs from "fs/promises";
import path from "path";

const SUBS_PATH = path.join(process.cwd(), ".cache", "subscribers.json");

export interface SubscriberData {
  emails: string[];
}

export async function readSubscribers(): Promise<SubscriberData> {
  try {
    const raw = await fs.readFile(SUBS_PATH, "utf-8");
    return JSON.parse(raw) as SubscriberData;
  } catch {
    return { emails: [] };
  }
}

export async function addSubscriber(email: string): Promise<boolean> {
  const data = await readSubscribers();
  const normalized = email.toLowerCase().trim();
  if (data.emails.includes(normalized)) return false;
  data.emails.push(normalized);
  await fs.mkdir(path.dirname(SUBS_PATH), { recursive: true });
  await fs.writeFile(SUBS_PATH, JSON.stringify(data, null, 2));
  return true;
}

export async function removeSubscriber(email: string): Promise<boolean> {
  const data = await readSubscribers();
  const normalized = email.toLowerCase().trim();
  const idx = data.emails.indexOf(normalized);
  if (idx === -1) return false;
  data.emails.splice(idx, 1);
  await fs.writeFile(SUBS_PATH, JSON.stringify(data, null, 2));
  return true;
}
