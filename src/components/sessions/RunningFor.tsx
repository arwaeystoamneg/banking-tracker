"use client";

import { useEffect, useState } from "react";
import { formatDuration, minutesSince } from "@/lib/dates";

/** " · running 3h 20m" for an open session, ticking every minute. */
export function RunningFor({ date, timeIn }: { date: string; timeIn: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = minutesSince(date, timeIn, now);
  if (minutes === null) return null;
  return <span className="text-xs text-muted"> · running {formatDuration(minutes)}</span>;
}
