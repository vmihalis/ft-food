"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

type FoodStatus = "food" | "drinks_only" | "none";

interface Report {
  event_id: string;
  type: "food" | "drinks";
  description: string;
  reporter_name: string;
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Email signup ────────────────────────────────────────────────────────

function EmailSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("submitting");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-green-400">
        &#10003; You&apos;re in! We&apos;ll email you when there&apos;s free food.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        className="flex-1 min-w-0 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-white/25 transition-colors"
      />
      <button
        type="submit"
        disabled={state === "submitting"}
        className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-50"
      >
        {state === "submitting" ? "..." : "Notify Me"}
      </button>
      {state === "error" && (
        <span className="text-xs text-red-400 self-center">Failed</span>
      )}
    </form>
  );
}

// ── Push notification prompt ────────────────────────────────────────────

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
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            .buffer as ArrayBuffer,
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

  if (subscribed || !show) return null;

  return (
    <button
      onClick={handleEnable}
      className="text-sm text-yellow-400/80 hover:text-yellow-400 transition-colors"
    >
      &#128276; Enable push notifications
    </button>
  );
}

// ── Install PWA button ──────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallButton() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    function handler(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShow(true);
    }

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") setShow(false);
    deferredPrompt.current = null;
  }

  if (!show) return null;

  return (
    <button
      onClick={handleInstall}
      className="text-sm text-neutral-400 hover:text-white transition-colors"
    >
      Install App
    </button>
  );
}

// ── Highlighted food/drinks event card ──────────────────────────────────

function FoodEventCard({
  event,
  reports,
}: {
  event: CachedEvent;
  reports: Report[];
}) {
  const time = formatTime(event.start_at, event.timezone);
  const endTime = formatTime(event.end_at, event.timezone);
  const isFood = event.food_status === "food";
  const isDrinks = event.food_status === "drinks_only";
  const isCommunity = !isFood && !isDrinks && reports.length > 0;
  const latest = reports.length > 0 ? reports[reports.length - 1] : null;

  const borderColor = isFood
    ? "border-green-500/40"
    : isDrinks
    ? "border-blue-500/40"
    : "border-yellow-500/40";
  const bgColor = isFood
    ? "bg-green-950/30"
    : isDrinks
    ? "bg-blue-950/20"
    : "bg-yellow-950/20";
  const dotColor = isFood
    ? "bg-green-400"
    : isDrinks
    ? "bg-blue-400"
    : "bg-yellow-400";

  return (
    <div
      className={`p-4 rounded-xl border ${borderColor} ${bgColor} transition-all`}
    >
      <div className="flex gap-4 items-start">
        {event.cover_url && (
          <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.cover_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
            <span className="text-xs text-neutral-400">
              {time} &ndash; {endTime}
            </span>
          </div>

          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold leading-snug hover:underline"
          >
            {event.name}
          </a>

          {isFood && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                FREE FOOD
              </span>
              {event.food_reason && (
                <span className="text-sm text-green-300">
                  &#127829; {event.food_reason}
                </span>
              )}
            </div>
          )}
          {isDrinks && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                FREE DRINKS
              </span>
              {event.food_reason && (
                <span className="text-sm text-blue-300">
                  &#127867; {event.food_reason}
                </span>
              )}
            </div>
          )}
          {isCommunity && latest && (
            <div className="mt-1.5 flex flex-col gap-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 w-fit">
                &#128064;{" "}
                {latest.reporter_name
                  ? `SPOTTED BY ${latest.reporter_name.toUpperCase()}`
                  : "COMMUNITY SPOTTED"}
              </span>
              {latest.description && (
                <span className="text-sm text-yellow-300">
                  {latest.type === "food" ? "\u{1F355}" : "\u{1F37A}"}{" "}
                  {latest.description}
                </span>
              )}
              <span className="text-xs text-neutral-500">
                {reports.length === 1
                  ? "1 report"
                  : `${reports.length} reports`}{" "}
                &middot; {timeAgo(latest.reported_at)}
              </span>
            </div>
          )}

          {event.address && (
            <p className="mt-1 text-xs text-neutral-500">{event.address}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Report form ─────────────────────────────────────────────────────────

function ReportButton({
  eventId,
  onReported,
  defaultOpen = false,
}: {
  eventId: string;
  onReported: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<"food" | "drinks">("food");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          type,
          description,
          reporter_name: name || undefined,
        }),
      });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setDescription("");
        setName("");
        onReported();
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-yellow-400/80 bg-yellow-500/8 border border-yellow-500/20 hover:bg-yellow-500/15 hover:border-yellow-500/30 hover:text-yellow-400 transition-all"
      >
        &#128064; I see food!
      </button>
    );
  }

  if (submitted) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-green-500/10 border border-green-500/25">
        <span className="text-green-400 text-sm font-medium">
          &#10003; Thanks{name ? `, ${name}` : ""}! Report is live.
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="mt-2 p-3 rounded-lg bg-yellow-500/8 border border-yellow-500/20"
    >
      <p className="text-xs font-medium text-yellow-400 mb-2">
        What did you spot?
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("food")}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              type === "food"
                ? "bg-green-500/20 text-green-400 border border-green-500/40"
                : "bg-white/5 text-neutral-500 border border-white/10"
            }`}
          >
            &#127829; Food
          </button>
          <button
            type="button"
            onClick={() => setType("drinks")}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              type === "drinks"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "bg-white/5 text-neutral-500 border border-white/10"
            }`}
          >
            &#127866; Drinks
          </button>
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's there? (e.g. Pizza, beer)"
          maxLength={200}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500/30 transition-colors"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={50}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500/30 transition-colors"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500 text-black hover:bg-yellow-400 transition-colors disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDescription("");
              setName("");
            }}
            className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Compact schedule event row ──────────────────────────────────────────

function ScheduleEventRow({
  event,
  reports,
  onReported,
}: {
  event: CachedEvent;
  reports: Report[];
  onReported: () => void;
}) {
  const [showReport, setShowReport] = useState(false);
  const time = formatTime(event.start_at, event.timezone);
  const hasFoodOrDrinks = event.food_status !== "none";
  const hasReports = reports.length > 0;

  if (hasFoodOrDrinks || hasReports) {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <button
        type="button"
        onClick={() => setShowReport(!showReport)}
        className="w-full flex items-center gap-3 py-2.5 px-3 text-left"
      >
        <span className="shrink-0 text-xs text-neutral-500 w-16 text-right tabular-nums">
          {time}
        </span>
        <div className="w-2 h-2 rounded-full bg-neutral-700 shrink-0" />
        <span className="flex-1 min-w-0 text-sm text-neutral-300 truncate">
          {event.name}
        </span>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${showReport ? "text-neutral-400" : "text-green-400 bg-green-500/10 border border-green-500/20"}`}>
          {showReport ? "✕ Close" : "🍕 I see food!"}
        </span>
      </button>
      {showReport && (
        <div className="px-3 pb-3">
          <ReportButton
            eventId={event.id}
            onReported={onReported}
            defaultOpen
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────

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

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  function handleReported() {
    fetch("/api/reports")
      .then((res) => res.json())
      .then((data) => setReports(data.reports ?? []))
      .catch(console.error);
  }

  const { foodEventsByDay, otherEventsByDay } = useMemo(() => {
    const food: { event: CachedEvent; reports: Report[] }[] = [];
    const other: CachedEvent[] = [];

    for (const event of events) {
      const eventReports = reports.filter((r) => r.event_id === event.id);
      if (event.food_status !== "none" || eventReports.length > 0) {
        food.push({ event, reports: eventReports });
      } else {
        other.push(event);
      }
    }

    // Group food events by day
    const foodGrouped: Record<
      string,
      { event: CachedEvent; reports: Report[] }[]
    > = {};
    for (const item of food) {
      const dayKey = new Date(item.event.start_at).toLocaleDateString("en-CA", {
        timeZone: item.event.timezone || "America/Los_Angeles",
      });
      if (!foodGrouped[dayKey]) foodGrouped[dayKey] = [];
      foodGrouped[dayKey].push(item);
    }
    const foodDays = Object.keys(foodGrouped).sort();
    for (const day of foodDays) {
      foodGrouped[day].sort(
        (a, b) =>
          new Date(a.event.start_at).getTime() -
          new Date(b.event.start_at).getTime()
      );
    }

    // Group other events by day
    const otherGrouped: Record<string, CachedEvent[]> = {};
    for (const event of other) {
      const dayKey = new Date(event.start_at).toLocaleDateString("en-CA", {
        timeZone: event.timezone || "America/Los_Angeles",
      });
      if (!otherGrouped[dayKey]) otherGrouped[dayKey] = [];
      otherGrouped[dayKey].push(event);
    }
    const otherDays = Object.keys(otherGrouped).sort();
    for (const day of otherDays) {
      otherGrouped[day].sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    }

    return {
      foodEventsByDay: foodDays.map((day) => ({
        day,
        events: foodGrouped[day],
      })),
      otherEventsByDay: otherDays.map((day) => ({
        day,
        events: otherGrouped[day],
      })),
    };
  }, [events, reports]);

  const totalFoodEvents = foodEventsByDay.reduce(
    (sum, d) => sum + d.events.length,
    0
  );

  return (
    <main className="min-h-screen">
      {/* ── Hero (full-bleed) ─────────────────────────────────────── */}
      <header className="relative mb-8 max-w-3xl mx-auto px-5 pt-5">
        <div className="relative rounded-2xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero.png"
            alt="FT Snacker"
            className="w-full h-auto"
          />
          {/* Light overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />

          {/* Title overlaid at top only */}
          <div className="absolute top-0 left-0 right-0 p-5 sm:p-8 text-center">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white drop-shadow-lg">
              FT SNACKER
            </h1>
            <p className="mt-1 text-base sm:text-lg font-medium text-white drop-shadow-lg">
              Free Food at Frontier Tower
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-neutral-400">
          Community-powered &mdash; anyone can report food they spot.
        </p>

        <div className="mt-4 flex gap-3 max-w-md mx-auto">
          <a
            href="#food"
            className="flex-1 text-center px-4 py-3 rounded-2xl text-sm font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 active:scale-95 transition-all"
          >
            &#127829; See Free Food
          </a>
          <a
            href="#report"
            className="flex-1 text-center px-4 py-3 rounded-2xl text-sm font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25 active:scale-95 transition-all"
          >
            &#128064; Report Food
          </a>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <EmailSignup />
          <div className="flex items-center gap-4 text-sm">
            <NotificationBanner />
            <InstallButton />
          </div>
        </div>

        {syncedAt && (
          <p className="mt-3 text-center text-xs text-neutral-600">
            Events updated {timeAgo(syncedAt)}
          </p>
        )}
      </header>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-5">
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

      {/* ── Food & Drinks section ─────────────────────────────────── */}
      {!loading && events.length > 0 && (
        <section id="food" className="mb-10 scroll-mt-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold">Food &amp; Drinks</h2>
            <div className="flex-1 h-px bg-white/10" />
            {totalFoodEvents > 0 && (
              <span className="text-xs text-green-400 bg-green-500/10 px-2.5 py-0.5 rounded-full">
                {totalFoodEvents} event{totalFoodEvents !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {foodEventsByDay.length === 0 ? (
            <div className="py-8 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
              <p className="text-neutral-500 text-sm">
                No food or drinks spotted yet
              </p>
              <p className="text-neutral-600 text-xs mt-1">
                See something at an event below? Hit &#128064; to report it!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {foodEventsByDay.map(({ day, events: dayFoodEvents }) => (
                <div key={day}>
                  <h3 className="text-sm font-semibold text-neutral-400 mb-2">
                    {formatDayHeader(day)}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {dayFoodEvents.map(({ event, reports: eventReports }) => (
                      <FoodEventCard
                        key={event.id}
                        event={event}
                        reports={eventReports}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Report food section ─────────────────────────────────── */}
      {otherEventsByDay.length > 0 && (
        <section id="report" className="scroll-mt-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-neutral-400">
              &#128064; Report Food at an Event
            </h2>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <p className="text-sm text-neutral-500 mb-4">
            At an event right now and see food? Tap the button to let everyone know.
          </p>

          {otherEventsByDay.map(({ day, events: dayEvents }) => (
            <div key={day} className="mb-6">
              <h3 className="text-sm font-semibold text-neutral-500 mb-2">
                {formatDayHeader(day)}
              </h3>
              <div className="flex flex-col gap-1.5">
                {dayEvents.map((event) => (
                  <ScheduleEventRow
                    key={event.id}
                    event={event}
                    reports={reports.filter((r) => r.event_id === event.id)}
                    onReported={handleReported}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <footer className="text-center text-neutral-600 text-xs pb-8 mt-10">
        <p>Data from Luma &middot; Frontier Tower SF</p>
      </footer>
      </div>
    </main>
  );
}
