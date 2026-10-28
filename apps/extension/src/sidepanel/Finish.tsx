import type { FinishResponse, StudentAssignment } from "@asterisk/shared";
import { useEffect, useId, useState } from "react";
import { ApiCallError, api } from "./api";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** S7 + S8: answer the teacher's comprehension questions in writing, then mark the assignment complete. */
export function Finish({
  token,
  assignment,
  onUnauthorized,
}: {
  token: string;
  assignment: StudentAssignment;
  onUnauthorized: () => void;
}) {
  const [status, setStatus] = useState<FinishResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const uid = useId();

  useEffect(() => {
    let cancelled = false;
    api
      .finishStatus(token, assignment.id)
      .then((res) => !cancelled && setStatus(res))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiCallError && err.status === 401) onUnauthorized();
        else setError(err instanceof ApiCallError ? err.message : "Couldn't load this step.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, assignment.id, onUnauthorized]);

  if (!status) return <p className="p-4 text-zinc-500">{error ?? "Loading…"}</p>;

  if (status.submittedAt) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-3xl" aria-hidden>
          ✓
        </p>
        <p className="font-semibold">Assignment complete</p>
        <p className="text-zinc-600">Marked complete {dateFormat.format(new Date(status.submittedAt))}. Your teacher has your answers.</p>
      </div>
    );
  }

  const unanswered = status.questions.some((q) => !answers[q.id]?.trim());

  async function submit() {
    setPending(true);
    setError(undefined);
    try {
      const res = await api.finish(token, assignment.id, {
        answers: status!.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
      });
      setStatus(res);
    } catch (err) {
      if (err instanceof ApiCallError && err.status === 401) return onUnauthorized();
      setError(err instanceof ApiCallError ? err.message : "Couldn't submit. Your answers are still here, so try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <h2 className="font-semibold">Finish your assignment</h2>
        <p className="text-zinc-600">
          {status.questions.length > 0
            ? "Answer in your own words. A few sentences is enough. Your teacher reads these to see what you understood."
            : "When you're done with your work, mark the assignment complete."}
        </p>
      </div>
      {status.questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-${i}`} className="font-medium">
            {i + 1}. {q.text}
          </label>
          <textarea
            id={`${uid}-${i}`}
            className="input min-h-24"
            maxLength={2000}
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={pending || unanswered}>
        {pending ? "Sending to your teacher…" : status.questions.length > 0 ? "Submit answers & mark complete" : "Mark complete"}
      </button>
      <p className="text-xs text-zinc-500">You can only do this once, so finish your work first.</p>
    </form>
  );
}
