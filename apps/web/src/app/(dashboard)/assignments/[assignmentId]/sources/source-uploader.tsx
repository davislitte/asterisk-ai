"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type SourceActionResult,
  addFileSource,
  addTextSource,
  addUrlSource,
  deleteSource,
} from "./actions";

type Mode = "file" | "text" | "url";

const MODES: { id: Mode; label: string }[] = [
  { id: "file", label: "Upload file" },
  { id: "text", label: "Paste text" },
  { id: "url", label: "Link" },
];

export function SourceUploader({ assignmentId }: { assignmentId: string }) {
  const [mode, setMode] = useState<Mode>("file");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function run(action: () => Promise<SourceActionResult>) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.added) {
        toast.success(`Added “${result.added.title}” (${result.added.chunkCount} sections)`);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (mode === "file") {
      const file = data.get("file");
      if (file instanceof File && file.size > 4 * 1024 * 1024) {
        setError("Files must be 4 MB or smaller.");
        return;
      }
      run(() => addFileSource(assignmentId, data));
    } else if (mode === "text") {
      run(() => addTextSource(assignmentId, { title: data.get("title"), text: data.get("text") }));
    } else {
      run(() => addUrlSource(assignmentId, { url: data.get("url") }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Source type" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => {
              setMode(m.id);
              setError(undefined);
            }}
            className={
              mode === m.id
                ? "rounded-md bg-background px-3 py-1 text-sm font-medium shadow-sm"
                : "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3">
        {mode === "file" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-file">PDF, Word (.docx) or text file, up to 4 MB</Label>
            <Input id="source-file" name="file" type="file" accept=".pdf,.docx,.txt,.md" required />
          </div>
        )}
        {mode === "text" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source-title">Title</Label>
              <Input id="source-title" name="title" required maxLength={200} placeholder="Class notes: factoring" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source-text">Text</Label>
              <Textarea id="source-text" name="text" required rows={8} />
              <p className="text-xs text-muted-foreground">Lines starting with # become citable sections.</p>
            </div>
          </>
        )}
        {mode === "url" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-url">Web page, PDF link or publicly shared Google Doc</Label>
            <Input id="source-url" name="url" type="url" required placeholder="https://" />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Reading…" : "Add source"}
        </Button>
      </form>
    </div>
  );
}

export function DeleteSourceButton({
  assignmentId,
  sourceId,
  title,
}: {
  assignmentId: string;
  sourceId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remove “${title}”? Students will no longer get help from it.`)) return;
        startTransition(async () => {
          const result = await deleteSource(assignmentId, sourceId);
          if (result.error) toast.error(result.error);
          else toast.success("Source removed");
        });
      }}
    >
      Remove
    </Button>
  );
}
