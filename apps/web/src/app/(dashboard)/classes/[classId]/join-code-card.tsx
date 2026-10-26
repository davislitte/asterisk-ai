"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { regenerateJoinCode } from "../../actions";

export function JoinCodeCard({ classId, joinCode }: { classId: string; joinCode: string }) {
  const [code, setCode] = useState(joinCode);
  const [pending, startTransition] = useTransition();

  function regenerate() {
    if (!confirm("Students who haven't joined yet will need the new code. Continue?")) return;
    startTransition(async () => {
      const result = await regenerateJoinCode(classId);
      if (result.joinCode) {
        setCode(result.joinCode);
        toast.success("New join code created");
      } else {
        toast.error(result.error ?? "Couldn't create a new code");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join code</CardTitle>
        <CardDescription>Students enter this in the Asterisk extension with their display name.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-4xl font-bold tracking-[0.3em]" aria-live="polite">
          {code}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Copied"))}
          >
            Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={regenerate} disabled={pending}>
            {pending ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
