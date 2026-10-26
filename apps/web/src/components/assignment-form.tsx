"use client";

import {
  DEFAULT_ALLOWLIST,
  HELP_LEVEL_DESCRIPTIONS,
  HELP_LEVEL_LABELS,
  type HelpLevel,
  matchesAllowlist,
} from "@asterisk/shared";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import {
  type AssignmentFormResult,
  createAssignment,
  updateAssignment,
} from "@/app/(dashboard)/assignments/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface AssignmentFormValues {
  title: string;
  subject: string;
  gradeLevel: string;
  instructions: string;
  dueAt: string | null;
  problems: { prompt: string; answerKey?: string }[];
  helpLevel: HelpLevel;
  allowlist: string[];
  endCheckEnabled: boolean;
}

export const EMPTY_ASSIGNMENT: AssignmentFormValues = {
  title: "",
  subject: "",
  gradeLevel: "",
  instructions: "",
  dueAt: null,
  problems: [{ prompt: "" }],
  helpLevel: 2,
  allowlist: DEFAULT_ALLOWLIST,
  endCheckEnabled: true,
};

type Mode = { kind: "create"; classId: string } | { kind: "edit"; assignmentId: string };

let nextKey = 0;
const withKey = <T,>(value: T) => ({ key: nextKey++, value });

export function AssignmentForm({ mode, initial }: { mode: Mode; initial: AssignmentFormValues }) {
  const [title, setTitle] = useState(initial.title);
  const [subject, setSubject] = useState(initial.subject);
  const [gradeLevel, setGradeLevel] = useState(initial.gradeLevel);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [dueAt, setDueAt] = useState(initial.dueAt);
  const [problems, setProblems] = useState(() => initial.problems.map(withKey));
  const [helpLevel, setHelpLevel] = useState<HelpLevel>(initial.helpLevel);
  const [allowlist, setAllowlist] = useState(() => initial.allowlist.map(withKey));
  const [endCheckEnabled, setEndCheckEnabled] = useState(initial.endCheckEnabled);
  const [testUrl, setTestUrl] = useState("");
  const [result, setResult] = useState<AssignmentFormResult>({});
  const [pending, startTransition] = useTransition();

  const err = (path: string) => result.fieldErrors?.[path];

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      title,
      subject,
      gradeLevel,
      instructions,
      dueAt,
      problems: problems
        .map((p) => p.value)
        .filter((p) => p.prompt.trim() || p.answerKey?.trim())
        .map((p) => ({ prompt: p.prompt, answerKey: p.answerKey?.trim() || undefined })),
      helpLevel,
      allowlist: allowlist.map((a) => a.value.trim()).filter(Boolean),
      endCheckEnabled,
    };
    startTransition(async () => {
      const res =
        mode.kind === "create"
          ? await createAssignment(mode.classId, input)
          : await updateAssignment(mode.assignmentId, input);
      setResult(res);
      if (res.ok) toast.success("Assignment saved");
      else if (res.error) toast.error(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" error={err("title")} className="sm:col-span-2">
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </Field>
          <Field label="Subject" error={err("subject")}>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Algebra I" />
          </Field>
          <Field label="Grade level" error={err("gradeLevel")}>
            <Input id="gradeLevel" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="9" />
          </Field>
          <Field label="Instructions for students" error={err("instructions")} className="sm:col-span-2">
            <Textarea
              id="instructions"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </Field>
          <Field label="Due date (optional)" error={err("dueAt")}>
            <LocalDateTimeInput id="dueAt" iso={dueAt} onChange={setDueAt} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assigned problems</CardTitle>
          <CardDescription>
            Asterisk will never give away the answer to these. Answer keys help it check its own
            replies for leaks and are never shown to students.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {problems.map((p, i) => (
            <div key={p.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2rem_1fr_1fr_auto]">
              <span className="pt-1.5 font-mono text-sm text-muted-foreground">{i + 1}.</span>
              <Field label="Problem" error={err(`problems.${i}.prompt`)}>
                <Textarea
                  id={`problem-${p.key}`}
                  rows={2}
                  value={p.value.prompt}
                  onChange={(e) =>
                    setProblems((list) =>
                      list.map((x) => (x.key === p.key ? { ...x, value: { ...x.value, prompt: e.target.value } } : x)),
                    )
                  }
                />
              </Field>
              <Field label="Answer key (teacher only)" error={err(`problems.${i}.answerKey`)}>
                <Textarea
                  id={`answer-${p.key}`}
                  rows={2}
                  value={p.value.answerKey ?? ""}
                  onChange={(e) =>
                    setProblems((list) =>
                      list.map((x) => (x.key === p.key ? { ...x, value: { ...x.value, answerKey: e.target.value } } : x)),
                    )
                  }
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start sm:mt-6"
                onClick={() => setProblems((list) => list.filter((x) => x.key !== p.key))}
                aria-label={`Remove problem ${i + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setProblems((list) => [...list, withKey({ prompt: "" })])}
          >
            Add problem
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Help level</CardTitle>
          <CardDescription>How much Asterisk may help. It never gives the final answer at any level.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={String(helpLevel)} onValueChange={(v) => setHelpLevel(Number(v) as HelpLevel)}>
            {([1, 2, 3, 4] as const).map((level) => (
              <label
                key={level}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary has-data-checked:bg-muted/50"
              >
                <RadioGroupItem value={String(level)} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {level}. {HELP_LEVEL_LABELS[level]}
                  </span>
                  <span className="text-sm text-muted-foreground">{HELP_LEVEL_DESCRIPTIONS[level]}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where Asterisk works</CardTitle>
          <CardDescription>
            The side panel only turns on for pages matching these patterns. Paste a link or type a
            pattern, using <code>*</code> as a wildcard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {allowlist.map((a, i) => (
            <div key={a.key} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Input
                  aria-label={`Allowed site ${i + 1}`}
                  className="font-mono"
                  value={a.value}
                  onChange={(e) =>
                    setAllowlist((list) => list.map((x) => (x.key === a.key ? { ...x, value: e.target.value } : x)))
                  }
                  placeholder="docs.google.com/document/*"
                  aria-invalid={err(`allowlist.${i}`) ? true : undefined}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAllowlist((list) => list.filter((x) => x.key !== a.key))}
                  disabled={allowlist.length === 1}
                >
                  Remove
                </Button>
              </div>
              {err(`allowlist.${i}`) && <p className="text-sm text-destructive">{err(`allowlist.${i}`)}</p>}
            </div>
          ))}
          {err("allowlist") && <p className="text-sm text-destructive">{err("allowlist")}</p>}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setAllowlist((list) => [...list, withKey("")])}
          >
            Add site
          </Button>
          <div className="mt-2 flex flex-col gap-1.5">
            <Label htmlFor="test-url">Test a page URL</Label>
            <Input
              id="test-url"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/…"
            />
            {testUrl.trim() && (
              <p className="text-sm" aria-live="polite">
                {matchesAllowlist(testUrl.trim(), allowlist.map((a) => a.value).filter(Boolean))
                  ? "✓ Asterisk would turn on here."
                  : "✗ Asterisk would stay off here."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>End-of-assignment check</CardTitle>
          <CardDescription>
            Before marking the assignment complete, students answer 3 comprehension questions out loud.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3">
            <Switch checked={endCheckEnabled} onCheckedChange={(checked) => setEndCheckEnabled(checked)} />
            <span>{endCheckEnabled ? "On" : "Off"}</span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode.kind === "create" ? "Create assignment" : "Save changes"}
        </Button>
        {result.error && <p className="text-sm text-destructive">{result.error}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = children.props.id;
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const subscribeNoop = () => () => {};

/**
 * `datetime-local` works in the browser's time zone, which the server doesn't
 * know, so the value is only filled in after hydration.
 */
function LocalDateTimeInput({
  id,
  iso,
  onChange,
}: {
  id: string;
  iso: string | null;
  onChange: (iso: string | null) => void;
}) {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const local = hydrated && iso ? toLocalInputValue(new Date(iso)) : "";
  return (
    <Input
      id={id}
      type="datetime-local"
      value={local}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
    />
  );
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
