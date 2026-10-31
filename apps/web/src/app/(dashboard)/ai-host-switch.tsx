"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiHost } from "@/server/ai-host";
import { chooseAiHost } from "./actions";

const OPTIONS: { host: AiHost; model: string; where: string; detail: string }[] = [
  {
    host: "meta",
    model: "Muse Spark",
    where: "Meta Model API",
    detail: "Meta's hosted model.",
  },
  {
    host: "district",
    model: "Muse Spark Open",
    where: "District-hosted",
    detail: "Meta's open-weight model, served on infrastructure the district controls (Baseten here), so student data stays there.",
  },
];

export function AiHostSwitch({ current, districtAvailable }: { current: AiHost; districtAvailable: boolean }) {
  const [host, setHost] = useState(current);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function choose(next: AiHost) {
    if (next === host || pending) return;
    const previous = host;
    setHost(next);
    startTransition(async () => {
      const res = await chooseAiHost(next);
      if (res.error) {
        setHost(previous);
        toast.error(res.error);
      } else {
        toast.success(`Asterisk now runs on ${OPTIONS.find((o) => o.host === next)!.model}.`);
        // Refresh the header's model label too.
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where Asterisk&apos;s AI runs</CardTitle>
        <CardDescription>Every feature works the same on either model. Switching applies to all classes right away.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="AI model" className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const disabled = o.host === "district" && !districtAvailable;
            return (
              <button
                key={o.host}
                type="button"
                role="radio"
                aria-checked={host === o.host}
                disabled={disabled || pending}
                onClick={() => choose(o.host)}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                  host === o.host ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                } ${disabled ? "opacity-60" : ""}`}
              >
                <span className="font-medium">
                  {o.model} <span className="font-normal text-muted-foreground">· {o.where}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {disabled ? "Add BASETEN_API_KEY to .env.local to turn this on." : o.detail}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
