"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { Switch } from "@/components/ui/switch";

/** Re-fetches the server-rendered monitor every few seconds while the tab is visible. */
export function AutoRefresh({ renderedAt, intervalMs = 10_000 }: { renderedAt: string; intervalMs?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live, intervalMs, router]);

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <label className="flex items-center gap-2">
        <Switch checked={live} onCheckedChange={(checked) => setLive(checked)} />
        <span>{live ? "Live" : "Paused"}</span>
      </label>
      <span>
        Updated <LocalDateTime iso={renderedAt} />
      </span>
    </div>
  );
}
