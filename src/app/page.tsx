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
      <p className="text-sm text-ft-green-light">
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
        className="flex-1 min-w-0 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-ft-purple/40 transition-colors"
      />
      <button
        type="submit"
        disabled={state === "submitting"}
        className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold bg-ft-purple text-white hover:bg-ft-purple-dark transition-colors disabled:opacity-50"
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
      className="text-sm text-ft-purple-light/80 hover:text-ft-purple-light transition-colors"
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
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (sessionStorage.getItem("pwa-dismiss")) return;

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

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem("pwa-dismiss", "1");
  }

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black via-black/95 to-black/80 backdrop-blur-sm border-t border-ft-purple/30">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">Get FT Snacker</p>
          <p className="text-xs text-neutral-400">Add to home screen for quick access</p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold bg-ft-purple text-white active:scale-95 transition-transform"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1.5 rounded-full text-neutral-500 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
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
    ? "border-ft-green/40"
    : isDrinks
    ? "border-ft-lavender/40"
    : "border-ft-purple/40";
  const bgColor = isFood
    ? "bg-ft-green/8"
    : isDrinks
    ? "bg-ft-lavender/8"
    : "bg-ft-purple/8";
  const dotColor = isFood
    ? "bg-ft-green-light"
    : isDrinks
    ? "bg-ft-lavender"
    : "bg-ft-purple-light";

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
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-ft-green/20 text-ft-green-light border border-ft-green/30">
                FREE FOOD
              </span>
              {event.food_reason && (
                <span className="text-sm text-ft-green-pale">
                  &#127829; {event.food_reason}
                </span>
              )}
            </div>
          )}
          {isDrinks && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-ft-lavender/20 text-ft-lavender border border-ft-lavender/30">
                FREE DRINKS
              </span>
              {event.food_reason && (
                <span className="text-sm text-ft-lavender-pale">
                  &#127867; {event.food_reason}
                </span>
              )}
            </div>
          )}
          {isCommunity && latest && (
            <div className="mt-1.5 flex flex-col gap-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-ft-purple/20 text-ft-purple-light border border-ft-purple/30 w-fit">
                &#128064;{" "}
                {latest.reporter_name
                  ? `SPOTTED BY ${latest.reporter_name.toUpperCase()}`
                  : "COMMUNITY SPOTTED"}
              </span>
              {latest.description && (
                <span className="text-sm text-ft-purple-pale">
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
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-ft-purple-light/80 bg-ft-purple/8 border border-ft-purple/20 hover:bg-ft-purple/15 hover:border-ft-purple/30 hover:text-ft-purple-light transition-all"
      >
        &#128064; I see food!
      </button>
    );
  }

  if (submitted) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-ft-green/10 border border-ft-green/25">
        <span className="text-ft-green-light text-sm font-medium">
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
      className="mt-2 p-3 rounded-lg bg-ft-purple/8 border border-ft-purple/20"
    >
      <p className="text-xs font-medium text-ft-purple-light mb-2">
        What did you spot?
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("food")}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              type === "food"
                ? "bg-ft-green/20 text-ft-green-light border border-ft-green/40"
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
                ? "bg-ft-lavender/20 text-ft-lavender border border-ft-lavender/40"
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
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-ft-purple/30 transition-colors"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={50}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-ft-purple/30 transition-colors"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-ft-purple text-white hover:bg-ft-purple-dark transition-colors disabled:opacity-50"
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
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${showReport ? "text-neutral-400" : "text-ft-green-light bg-ft-green/10 border border-ft-green/20"}`}>
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

const EVENTS_PER_PAGE = 6;

export default function Home() {
  const [events, setEvents] = useState<CachedEvent[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [foodPage, setFoodPage] = useState(0);
  const [reportPage, setReportPage] = useState(0);

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

  const totalOtherEvents = otherEventsByDay.reduce(
    (sum, d) => sum + d.events.length,
    0
  );

  const foodTotalPages = Math.max(1, Math.ceil(totalFoodEvents / EVENTS_PER_PAGE));
  const reportTotalPages = Math.max(1, Math.ceil(totalOtherEvents / EVENTS_PER_PAGE));

  // Paginate food events (flatten → slice → re-group by day)
  const paginatedFoodByDay = useMemo(() => {
    const flat = foodEventsByDay.flatMap(({ day, events: dayEvents }) =>
      dayEvents.map((item) => ({ day, ...item }))
    );
    const start = foodPage * EVENTS_PER_PAGE;
    const slice = flat.slice(start, start + EVENTS_PER_PAGE);
    const grouped: { day: string; events: { event: CachedEvent; reports: Report[] }[] }[] = [];
    for (const { day, event, reports: r } of slice) {
      const last = grouped[grouped.length - 1];
      if (last && last.day === day) {
        last.events.push({ event, reports: r });
      } else {
        grouped.push({ day, events: [{ event, reports: r }] });
      }
    }
    return grouped;
  }, [foodEventsByDay, foodPage]);

  // Paginate other events (flatten → slice → re-group by day)
  const paginatedOtherByDay = useMemo(() => {
    const flat = otherEventsByDay.flatMap(({ day, events: dayEvents }) =>
      dayEvents.map((event) => ({ day, event }))
    );
    const start = reportPage * EVENTS_PER_PAGE;
    const slice = flat.slice(start, start + EVENTS_PER_PAGE);
    const grouped: { day: string; events: CachedEvent[] }[] = [];
    for (const { day, event } of slice) {
      const last = grouped[grouped.length - 1];
      if (last && last.day === day) {
        last.events.push(event);
      } else {
        grouped.push({ day, events: [event] });
      }
    }
    return grouped;
  }, [otherEventsByDay, reportPage]);

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
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-ft-purple-light drop-shadow-lg">
              FT SNACKER
            </h1>
            <p className="mt-1 text-xl sm:text-2xl font-medium text-ft-purple-pale drop-shadow-lg">
              Free Food at Frontier Tower
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-base sm:text-lg text-neutral-400">
          Community-powered &mdash; anyone can report food they spot.
        </p>

        <div className="mt-4 flex gap-3 max-w-md mx-auto">
          <a
            href="#food"
            className="flex-1 text-center px-4 py-3 rounded-2xl text-sm font-bold bg-ft-purple text-white border border-ft-purple hover:bg-ft-purple-dark active:scale-95 transition-all"
          >
            &#127829; See Free Food
          </a>
          <a
            href="#report"
            className="flex-1 text-center px-4 py-3 rounded-2xl text-sm font-bold bg-ft-purple/15 text-ft-purple-light border border-ft-purple/30 hover:bg-ft-purple/25 active:scale-95 transition-all"
          >
            &#128064; Report Food
          </a>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <EmailSignup />
          <div className="flex items-center gap-4 text-sm">
            <NotificationBanner />
          </div>
        </div>

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
              <span className="text-xs text-ft-green-light bg-ft-green/10 px-2.5 py-0.5 rounded-full">
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
            <>
              <div className="flex flex-col gap-5">
                {paginatedFoodByDay.map(({ day, events: dayFoodEvents }) => (
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
              {foodTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-5">
                  <button
                    onClick={() => setFoodPage((p) => Math.max(0, p - 1))}
                    disabled={foodPage === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-neutral-500">
                    {foodPage + 1} / {foodTotalPages}
                  </span>
                  <button
                    onClick={() => setFoodPage((p) => Math.min(foodTotalPages - 1, p + 1))}
                    disabled={foodPage >= foodTotalPages - 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
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

          {paginatedOtherByDay.map(({ day, events: dayEvents }) => (
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
          {reportTotalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={() => setReportPage((p) => Math.max(0, p - 1))}
                disabled={reportPage === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-neutral-500">
                {reportPage + 1} / {reportTotalPages}
              </span>
              <button
                onClick={() => setReportPage((p) => Math.min(reportTotalPages - 1, p + 1))}
                disabled={reportPage >= reportTotalPages - 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}

      <footer className="text-center text-neutral-600 text-xs pb-8 mt-10">
        <p>Data from Luma &middot; Frontier Tower SF</p>
      </footer>
      </div>
      <InstallButton />
    </main>
  );
}
