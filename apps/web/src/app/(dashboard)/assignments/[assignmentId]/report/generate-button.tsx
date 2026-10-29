"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateReport } from "./actions";

export function GenerateReportButton({ assignmentId, hasReport }: { assignmentId: string; hasReport: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  function run() {
    setError(undefined);
    setSeconds(0);
    start(async () => {
      const res = await generateReport(assignmentId);
      if (res.error) setError(res.error);
      else toast.success("Class report ready.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={pending}>
        {pending ? `Reading the class's work… ${seconds}s` : hasReport ? "Rebuild report" : "Build class report"}
      </Button>
      {pending && <p className="text-xs text-muted-foreground">Usually takes under a minute.</p>}
      {error && (
        <p role="alert" className="max-w-sm text-right text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
