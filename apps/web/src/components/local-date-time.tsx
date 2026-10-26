"use client";

import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};
const format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Formats a timestamp in the viewer's time zone. The server (UTC on Vercel)
 * doesn't know it, so this renders after hydration to avoid showing UTC times.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {hydrated ? format.format(new Date(iso)) : ""}
    </time>
  );
}
