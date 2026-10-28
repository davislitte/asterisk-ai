"use client";

import type { QuestionOrigin } from "@asterisk/shared";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { draftQuestions, saveQuestions } from "./actions";

interface EditorQuestion {
  key: number;
  id?: string;
  text: string;
  approved: boolean;
  origin: QuestionOrigin;
  checks?: string;
  answerCount: number;
}

let nextKey = 0;

export function QuestionsEditor({
  assignmentId,
  endCheckEnabled,
  initial,
}: {
  assignmentId: string;
  endCheckEnabled: boolean;
  initial: { id: string; text: string; approved: boolean; origin: QuestionOrigin; answerCount: number }[];
}) {
  const [questions, setQuestions] = useState<EditorQuestion[]>(() => initial.map((q) => ({ ...q, key: nextKey++ })));
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const [drafting, startDrafting] = useTransition();
  const uid = useId();
  const approvedCount = questions.filter((q) => q.approved && q.text.trim()).length;

  const update = (key: number, patch: Partial<EditorQuestion>) =>
    setQuestions((list) => list.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  function draft() {
    setError(undefined);
    startDrafting(async () => {
      const res = await draftQuestions(assignmentId);
      if (!res.questions) return setError(res.error);
      setQuestions((list) => [
        ...list,
        ...res.questions!.map((q) => ({
          key: nextKey++,
          text: q.text,
          checks: q.checks,
          approved: false,
          origin: "generated" as const,
          answerCount: 0,
        })),
      ]);
      toast.success("Drafted 3 questions. Edit and approve the ones you want.");
    });
  }

  function save() {
    setError(undefined);
    startSaving(async () => {
      const res = await saveQuestions(assignmentId, {
        questions: questions.map(({ id, text, approved, origin }) => ({ id, text, approved, origin })),
      });
      if (res.ok) toast.success("Questions saved");
      else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comprehension questions</CardTitle>
        <CardDescription>
          Before marking the assignment complete, students answer the approved questions in writing. Asterisk grades
          their understanding for you; students don&apos;t see the grades.
          {!endCheckEnabled && (
            <span className="mt-1 block font-medium text-destructive">
              The end-of-assignment check is off for this assignment, so students won&apos;t see these. Turn it on in
              Details.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {questions.length === 0 && <p className="text-muted-foreground">No questions yet.</p>}
        {questions.map((q, i) => (
          <div key={q.key} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${uid}-q-${i}`} className="text-sm font-medium">
                Question {i + 1}{" "}
                {q.origin === "generated" && <Badge variant="secondary">Drafted by Asterisk</Badge>}
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={q.approved} onCheckedChange={(approved) => update(q.key, { approved })} />
                  {q.approved ? "Approved" : "Not approved"}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={q.answerCount > 0}
                  title={q.answerCount > 0 ? "Students have answered this; unapprove it instead" : undefined}
                  onClick={() => setQuestions((list) => list.filter((x) => x.key !== q.key))}
                >
                  Remove
                </Button>
              </div>
            </div>
            <Textarea id={`${uid}-q-${i}`} rows={2} value={q.text} onChange={(e) => update(q.key, { text: e.target.value })} />
            {q.checks && <p className="text-xs text-muted-foreground">Checks: {q.checks}</p>}
            {q.answerCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {q.answerCount} {q.answerCount === 1 ? "answer" : "answers"} so far
              </p>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={draft} disabled={drafting}>
            {drafting ? "Drafting from your sources…" : "Draft 3 questions with Asterisk"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setQuestions((list) => [...list, { key: nextKey++, text: "", approved: true, origin: "teacher", answerCount: 0 }])
            }
          >
            Write my own
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save questions"}
          </Button>
          <span className="text-sm text-muted-foreground">{approvedCount} approved</span>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
