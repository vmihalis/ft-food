const LUMA_API_BASE = "https://public-api.luma.com/v1";
const LUMA_API_KEY = process.env.LUMA_API_KEY!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

export interface LumaEvent {
  id: string;
  name: string;
  description: string;
  description_md: string;
  start_at: string;
  end_at: string;
  timezone: string;
  url: string;
  cover_url: string;
  visibility: string;
  geo_address_json: {
    address?: string;
    full_address?: string;
  } | null;
  geo_latitude: string | null;
  geo_longitude: string | null;
}

export interface LumaEntry {
  api_id: string;
  event: LumaEvent;
  tags: { id: string; name: string }[];
}

export interface LumaListResponse {
  entries: LumaEntry[];
  has_more: boolean;
  next_cursor?: string;
}

export type FoodStatus = "food" | "drinks_only" | "none";

export interface FoodClassification {
  status: FoodStatus;
  reason: string;
}

async function classifyBatch(
  events: { id: string; name: string; description: string }[]
): Promise<Record<string, FoodClassification>> {
  const eventList = events
    .map(
      (e, i) =>
        `[${i}] id=${e.id}\nTitle: ${e.name}\nDescription: ${e.description.slice(0, 800)}`
    )
    .join("\n\n---\n\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      messages: [
        {
          role: "system",
          content: `You classify events by whether the EVENT ORGANIZERS are providing free food or drinks to attendees.
Reply ONLY with a JSON array. Each element: {"id": "<event id>", "status": "food" | "drinks_only" | "none", "items": "<what exactly is being served>"}

Rules:
- "food" = the organizers/hosts are PROVIDING free food, snacks, meals, bites, appetizers, pizza, tacos, catering, etc. to attendees
- "drinks_only" = the organizers are PROVIDING drinks (beer, wine, cocktails, coffee, kombucha, etc.) but no food
- "none" = no mention of organizers providing food or drinks

For the "items" field:
- Be SPECIFIC about what's being served. Extract exact items from the description.
- Examples: "Pizza + beer", "Tacos, chips & salsa, margaritas", "Coffee & pastries", "Wine & cheese", "Full catered dinner + open bar"
- If the description just says generic "food and drinks" or "refreshments", say "Food & drinks" or "Refreshments"
- For "none" status, leave items as ""

CRITICAL - these are NOT free food:
- "bring your own food" or "welcome to bring food" = NONE (attendees bring their own, organizers aren't providing)
- "potluck" or "bring food to share" = NONE (attendees provide, not organizers)
- "healthy food" or "food" in a venue/building description = NONE (describing the venue, not the event)
- Event is ABOUT food/cooking as a topic = NONE (unless food is also served)
- "food available for purchase" or paid food = NONE (not free)
- Ignore all boilerplate Frontier Tower descriptions at the end of events

Only mark "food" or "drinks_only" when the description clearly states the organizers will serve/provide it at no cost to attendees.

Return ONLY the JSON array, no markdown fences.`,
        },
        {
          role: "user",
          content: `Classify these ${events.length} events:\n\n${eventList}`,
        },
      ],
      temperature: 0,
    }),
  });

  if (!res.ok) {
    console.error("OpenRouter error:", res.status, await res.text());
    // Fallback: return all as none
    const fallback: Record<string, FoodClassification> = {};
    for (const e of events) {
      fallback[e.id] = { status: "none", reason: "classification failed" };
    }
    return fallback;
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "[]";

  let parsed: { id: string; status: FoodStatus; items: string }[];
  try {
    // Strip markdown fences if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse LLM response:", content);
    const fallback: Record<string, FoodClassification> = {};
    for (const e of events) {
      fallback[e.id] = { status: "none", reason: "parse failed" };
    }
    return fallback;
  }

  const result: Record<string, FoodClassification> = {};
  for (const item of parsed) {
    result[item.id] = {
      status: item.status,
      reason: item.items || "",
    };
  }
  // Fill any missing
  for (const e of events) {
    if (!result[e.id]) {
      result[e.id] = { status: "none", reason: "not classified" };
    }
  }
  return result;
}

export async function classifyEvents(
  entries: LumaEntry[]
): Promise<Record<string, FoodClassification>> {
  const BATCH_SIZE = 20;
  const allResults: Record<string, FoodClassification> = {};

  const batches: { id: string; name: string; description: string }[][] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push(
      entries.slice(i, i + BATCH_SIZE).map((e) => ({
        id: e.event.id,
        name: e.event.name,
        description: e.event.description,
      }))
    );
  }

  // Run batches in parallel
  const results = await Promise.all(batches.map((batch) => classifyBatch(batch)));
  for (const r of results) {
    Object.assign(allResults, r);
  }

  return allResults;
}

export async function fetchUpcomingEvents(): Promise<LumaEntry[]> {
  const now = new Date().toISOString();
  const allEntries: LumaEntry[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      after: now,
      sort_column: "start_at",
      sort_direction: "asc",
      pagination_limit: "50",
    });
    if (cursor) {
      params.set("pagination_cursor", cursor);
    }

    const res = await fetch(`${LUMA_API_BASE}/calendar/list-events?${params}`, {
      headers: { "x-luma-api-key": LUMA_API_KEY },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(`Luma API error: ${res.status} ${res.statusText}`);
    }

    const data: LumaListResponse = await res.json();
    allEntries.push(...data.entries);

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return allEntries;
}
