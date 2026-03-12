"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type FoodStatus = "food" | "drinks_only" | "none";

interface CachedEvent {
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

function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDayHeader(dateKey: string): string {
  const date = new Date(dateKey + "T12:00:00");
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const toKey = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  if (dateKey === toKey(today)) return "Today";
  if (dateKey === toKey(tomorrow)) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function FoodTag({ status, reason }: { status: FoodStatus; reason: string }) {
  if (status === "food") {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 w-fit">
          FREE FOOD
        </span>
        {reason && (
          <span className="text-sm font-semibold text-green-300">
            &#127869; {reason}
          </span>
        )}
      </div>
    );
  }
  if (status === "drinks_only") {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 w-fit">
          FREE DRINKS
        </span>
        {reason && (
          <span className="text-sm font-semibold text-blue-300">
            &#127867; {reason}
          </span>
        )}
      </div>
    );
  }
  return null;
}

function ScheduleEvent({ event }: { event: CachedEvent }) {
  const hasFoodOrDrinks = event.food_status !== "none";
  const time = formatTime(event.start_at, event.timezone);
  const endTime = formatTime(event.end_at, event.timezone);

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex gap-4 items-start p-4 rounded-xl border transition-all hover:scale-[1.01] hover:shadow-lg ${
        event.food_status === "food"
          ? "border-green-500/40 bg-green-950/20 hover:border-green-400/60"
          : event.food_status === "drinks_only"
          ? "border-blue-500/30 bg-blue-950/10 hover:border-blue-400/50"
          : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
    >
      {/* Time column */}
      <div className="shrink-0 w-20 text-right pt-0.5">
        <div className="text-sm font-medium text-neutral-300">{time}</div>
        <div className="text-xs text-neutral-600">{endTime}</div>
      </div>

      {/* Timeline dot */}
      <div className="shrink-0 flex flex-col items-center pt-1.5">
        <div
          className={`w-3 h-3 rounded-full ${
            event.food_status === "food"
              ? "bg-green-400"
              : event.food_status === "drinks_only"
              ? "bg-blue-400"
              : "bg-neutral-600"
          }`}
        />
      </div>

      {/* Event details */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold leading-snug">{event.name}</h3>
        {hasFoodOrDrinks && (
          <div className="mt-2">
            <FoodTag status={event.food_status} reason={event.food_reason} />
          </div>
        )}
        {event.address && (
          <p className="mt-1.5 text-xs text-neutral-500">{event.address}</p>
        )}
      </div>

      {/* Cover image */}
      {event.cover_url && (
        <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.cover_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </a>
  );
}

function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("success");
      setMessage(data.message);
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to subscribe");
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="font-semibold text-lg">Get the daily schedule</h3>
      <p className="text-sm text-neutral-400 mt-1">
        We&apos;ll email you every morning with today&apos;s free food &amp; drink events.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          placeholder="you@example.com"
          required
          className="flex-1 px-4 py-2.5 rounded-lg bg-white/10 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-5 py-2.5 rounded-lg font-medium text-sm bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-50"
        >
          {status === "loading" ? "..." : "Subscribe"}
        </button>
      </form>
      {status === "success" && (
        <p className="mt-2 text-sm text-green-400">{message}</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-sm text-red-400">{message}</p>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Home() {
  const [events, setEvents] = useState<CachedEvent[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data.events ?? []);
      setSyncedAt(data.synced_at ?? null);
      setError(null);
    } catch {
      setError("Failed to load cached events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sync failed");
      }
      const data = await res.json();
      setEvents(data.events);
      setSyncedAt(data.synced_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Group events by day
  const schedule = useMemo(() => {
    const grouped: Record<string, CachedEvent[]> = {};
    for (const event of events) {
      const dayKey = new Date(event.start_at).toLocaleDateString("en-CA", {
        timeZone: event.timezone || "America/Los_Angeles",
      });
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(event);
    }
    // Sort days chronologically
    const sortedDays = Object.keys(grouped).sort();
    // Sort events within each day by start time
    for (const day of sortedDays) {
      grouped[day].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    }
    return sortedDays.map((day) => ({ day, events: grouped[day] }));
  }, [events]);

  // Count food/drink events
  const foodCount = events.filter((e) => e.food_status === "food").length;
  const drinkCount = events.filter((e) => e.food_status === "drinks_only").length;

  return (
    <main className="min-h-screen px-4 py-10 max-w-3xl mx-auto">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          &#127829; Free Food at Frontier Tower
        </h1>
        <p className="mt-3 text-neutral-400 text-lg">
          Daily schedule of free food &amp; drinks at 995 Market St, SF
        </p>

        {(foodCount > 0 || drinkCount > 0) && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {foodCount > 0 && (
              <span className="text-sm text-green-400 bg-green-500/10 px-3 py-1 rounded-full">
                &#127829; {foodCount} food event{foodCount !== 1 ? "s" : ""}
              </span>
            )}
            {drinkCount > 0 && (
              <span className="text-sm text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
                &#127866; {drinkCount} drink event{drinkCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? "Syncing..." : "Sync Events"}
          </button>
          {syncedAt && (
            <span className="text-xs text-neutral-600">
              Last synced {timeAgo(syncedAt)}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="text-center py-6 text-red-400 text-sm">
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-20 text-neutral-500">
          <p>Loading...</p>
        </div>
      )}

      {!loading && events.length === 0 && !error && (
        <div className="text-center py-20 text-neutral-500">
          <p className="text-2xl mb-2">No events cached yet</p>
          <p>Hit &quot;Sync Events&quot; to fetch from Luma</p>
        </div>
      )}

      {/* Schedule */}
      {schedule.map(({ day, events: dayEvents }) => {
        const hasFoodOrDrinks = dayEvents.some((e) => e.food_status !== "none");
        return (
          <section key={day} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold">{formatDayHeader(day)}</h2>
              <div className="flex-1 h-px bg-white/10" />
              {hasFoodOrDrinks && (
                <span className="text-xs text-green-400">
                  &#127829;{" "}
                  {dayEvents.filter((e) => e.food_status !== "none").length} with
                  free stuff
                </span>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {dayEvents.map((event) => (
                <ScheduleEvent key={event.id} event={event} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Subscribe */}
      {!loading && (
        <div className="mt-8 mb-12">
          <SubscribeForm />
        </div>
      )}

      <footer className="text-center text-neutral-600 text-xs pb-8">
        <p>Data from Luma &middot; Frontier Tower SF</p>
      </footer>
    </main>
  );
}
