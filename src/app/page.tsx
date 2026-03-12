"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type FoodStatus = "food" | "drinks_only" | "none";

interface Report {
  event_id: string;
  type: "food" | "drinks";
  description: string;
  reported_at: string;
}

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

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

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

function ReportButton({
  eventId,
  onReported,
}: {
  eventId: string;
  onReported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"food" | "drinks">("food");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, type, description }),
      });
      setOpen(false);
      setDescription("");
      onReported();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="mt-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors"
      >
        &#128064; I see free food/drinks here!
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.preventDefault()}
      className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setType("food");
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              type === "food"
                ? "bg-green-500/30 text-green-400 border border-green-500/40"
                : "bg-white/5 text-neutral-400 border border-white/10"
            }`}
          >
            &#127829; Food
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setType("drinks");
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              type === "drinks"
                ? "bg-blue-500/30 text-blue-400 border border-blue-500/40"
                : "bg-white/5 text-neutral-400 border border-white/10"
            }`}
          >
            &#127866; Drinks
          </button>
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="What do you see? (e.g. Pizza, beer)"
          maxLength={200}
          className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            onClick={(e) => e.stopPropagation()}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Report"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="px-4 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-neutral-300"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ReportBadges({ reports }: { reports: Report[] }) {
  if (reports.length === 0) return null;

  const latest = reports[reports.length - 1];
  const ago = timeAgo(latest.reported_at);

  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 w-fit">
        &#128064; SPOTTED BY ATTENDEE
      </span>
      {latest.description && (
        <span className="text-sm font-semibold text-yellow-300">
          {latest.type === "food" ? "\u{1F355}" : "\u{1F37A}"} {latest.description}
        </span>
      )}
      <span className="text-xs text-neutral-500">
        {reports.length === 1 ? "1 report" : `${reports.length} reports`} &middot; {ago}
      </span>
    </div>
  );
}

function ScheduleEvent({
  event,
  reports,
  onReported,
}: {
  event: CachedEvent;
  reports: Report[];
  onReported: () => void;
}) {
  const hasFoodOrDrinks = event.food_status !== "none";
  const hasReports = reports.length > 0;
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
          : hasReports
          ? "border-yellow-500/30 bg-yellow-950/10 hover:border-yellow-400/50"
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
              : hasReports
              ? "bg-yellow-400"
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
        {hasReports && !hasFoodOrDrinks && (
          <ReportBadges reports={reports} />
        )}
        {!hasFoodOrDrinks && !hasReports && (
          <ReportButton eventId={event.id} onReported={onReported} />
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function NotificationBanner() {
  const [show, setShow] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if ("Notification" in window && "serviceWorker" in navigator) {
      if (Notification.permission === "default") {
        setShow(true);
      } else if (Notification.permission === "granted") {
        setSubscribed(true);
        registerPush();
      }
    }
  }, []);

  async function registerPush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription && VAPID_PUBLIC_KEY) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      }
    } catch (err) {
      console.error("Push registration failed:", err);
    }
  }

  async function handleEnable() {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setSubscribed(true);
      setShow(false);
      await registerPush();
    } else {
      setShow(false);
    }
  }

  if (subscribed) {
    return (
      <div className="mb-6 rounded-xl border border-green-500/20 bg-green-950/10 px-4 py-3 text-sm text-green-400 flex items-center gap-2">
        &#128276; Notifications on &mdash; you&apos;ll get pinged when someone spots free food
      </div>
    );
  }

  if (!show) return null;

  return (
    <div className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-950/10 px-4 py-3 flex items-center justify-between gap-4">
      <p className="text-sm text-yellow-400">
        &#128276; Get notified instantly when someone spots free food
      </p>
      <button
        onClick={handleEnable}
        className="shrink-0 px-4 py-1.5 rounded-lg text-xs font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
      >
        Enable
      </button>
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
  const [reports, setReports] = useState<Report[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCache = useCallback(async () => {
    try {
      const [eventsRes, reportsRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/reports"),
      ]);
      const eventsData = await eventsRes.json();
      const reportsData = await reportsRes.json();
      setEvents(eventsData.events ?? []);
      setSyncedAt(eventsData.synced_at ?? null);
      setReports(reportsData.reports ?? []);
      setError(null);
    } catch {
      setError("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  function handleReported() {
    // Refresh reports
    fetch("/api/reports")
      .then((res) => res.json())
      .then((data) => setReports(data.reports ?? []))
      .catch(console.error);
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
    const sortedDays = Object.keys(grouped).sort();
    for (const day of sortedDays) {
      grouped[day].sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    }
    return sortedDays.map((day) => ({ day, events: grouped[day] }));
  }, [events]);

  const foodCount = events.filter((e) => e.food_status === "food").length;
  const drinkCount = events.filter(
    (e) => e.food_status === "drinks_only"
  ).length;

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

        {syncedAt && (
          <p className="mt-4 text-xs text-neutral-600">
            Last synced {timeAgo(syncedAt)}
          </p>
        )}
      </header>

      <NotificationBanner />

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
          <p className="text-2xl mb-2">No upcoming events</p>
          <p>Events sync automatically every night</p>
        </div>
      )}

      {/* Schedule */}
      {schedule.map(({ day, events: dayEvents }) => {
        return (
          <section key={day} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold">{formatDayHeader(day)}</h2>
              <div className="flex-1 h-px bg-white/10" />
              {(() => {
                const food = dayEvents.filter(
                  (e) => e.food_status === "food"
                ).length;
                const drinks = dayEvents.filter(
                  (e) => e.food_status === "drinks_only"
                ).length;
                const reported = dayEvents.filter(
                  (e) =>
                    e.food_status === "none" &&
                    reports.some((r) => r.event_id === e.id)
                ).length;
                return (
                  <>
                    {food > 0 && (
                      <span className="text-xs text-green-400">
                        &#127829; {food} with free food
                      </span>
                    )}
                    {drinks > 0 && (
                      <span className="text-xs text-blue-400">
                        &#127866; {drinks} with free drinks
                      </span>
                    )}
                    {reported > 0 && (
                      <span className="text-xs text-yellow-400">
                        &#128064; {reported} spotted
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex flex-col gap-3">
              {dayEvents.map((event) => (
                <ScheduleEvent
                  key={event.id}
                  event={event}
                  reports={reports.filter((r) => r.event_id === event.id)}
                  onReported={handleReported}
                />
              ))}
            </div>
          </section>
        );
      })}

      <footer className="text-center text-neutral-600 text-xs pb-8">
        <p>Data from Luma &middot; Frontier Tower SF</p>
      </footer>
    </main>
  );
}
