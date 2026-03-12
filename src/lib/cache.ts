import fs from "fs/promises";
import path from "path";
import type { FoodStatus } from "./luma";

export interface CachedEvent {
  id: string;
  name: string;
  start_at: string;
  end_at: string;
  timezone: string;
  url: string;
  cover_url: string;
  address: string | null;
  food_status: FoodStatus;
  food_reason: string;
}

export interface CacheData {
  synced_at: string;
  events: CachedEvent[];
}

const CACHE_PATH = path.join(process.cwd(), ".cache", "events.json");

export async function readCache(): Promise<CacheData | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

export async function writeCache(data: CacheData): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2));
}
