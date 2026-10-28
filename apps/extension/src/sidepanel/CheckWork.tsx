import type { RubricCheckResponse, StudentAssignment } from "@asterisk/shared";
import { useEffect, useState } from "react";
import { ApiCallError, api } from "./api";
import { DraftPicker } from "./DraftPicker";
import type { Draft } from "./read-doc";

/** S6: pre-submit rubric check. Feedback says what to improve; it never rewrites the student's work. */
export function CheckWork({
  token,
  assignment,
  draft,
  onDraftChange,
  onUnauthorized,
}: {
  token: string;
  assignment: StudentAssignment;
  draft: Draft | null;
  onDraftChange: (draft: Draft | null) => void;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<RubricCheckResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api
      .rubricCheck(token, assignment.id)
      .then((res) => !cancelled && setData(res))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiCallError && err.status === 401) onUnauthorized();
        else setError(err instanceof ApiCallError ? err.message : "Couldn't load the rubric.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, assignment.id, onUnauthorized]);

  async function run() {
    if (!draft) return;
    setPending(true);
    setError(undefined);
    try {
      setData(await api.runRubricCheck(token, assignment.id, { draft: draft.text, source: draft.source }));
    } catch (err) {
      if (err instanceof ApiCallError && err.status === 401) return onUnauthorized();
      setError(err instanceof ApiCallError ? err.message : "Couldn't check your work. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!data) {
    return <p className="p-4 text-zinc-500">{error ?? "Loading…"}</p>;
  }
  if (data.rubric.length === 0) {
    return <p className="p-4 text-zinc-600">Your teacher hasn't added a rubric for this assignment yet.</p>;
  }

  const latest = data.latest;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Check your work before you submit</h2>
        <p className="text-zinc-600">
          Asterisk compares your draft with your teacher's rubric and tells you what to work on. It won't fix it for you.
        </p>
        <DraftPicker draft={draft} onChange={onDraftChange} allowPaste />
        {draft && (
          <button type="button" className="btn" onClick={run} disabled={pending}>
            {pending ? "Checking against the rubric…" : latest ? "Check again" : "Check against the rubric"}
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        )}
      </div>

      {latest && (
        <section aria-label="Rubric feedback" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Feedback</h3>
            <span className="text-xs text-zinc-500">
              {latest.totalPoints} / {latest.maxPoints} points · practice only
            </span>
          </div>
          {latest.overall && <p className="rounded-lg bg-accent-soft p-3">{latest.overall}</p>}
          <ul className="flex flex-col gap-2">
            {latest.criteria.map((c) => (
              <li key={c.name} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                    {c.level} · {c.points}/{c.maxPoints}
                  </span>
                </div>
                {c.strengths && <p className="mt-2 text-zinc-700">✓ {c.strengths}</p>}
                {c.nextStep && <p className="mt-1 text-zinc-700">→ {c.nextStep}</p>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            This is practice feedback to help you improve. Your teacher grades the version you submit.
          </p>
        </section>
      )}

      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer">See the rubric</summary>
        <ul className="mt-2 flex flex-col gap-2">
          {data.rubric.map((c) => (
            <li key={c.name}>
              <p className="font-medium text-zinc-800">{c.name}</p>
              <ul className="ml-3 list-disc">
                {c.levels.map((l) => (
                  <li key={l.label}>
                    {l.label} ({l.points}): {l.description}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
