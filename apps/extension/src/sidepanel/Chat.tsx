import { HELP_LEVEL_LABELS, type StudentAssignment, type StudentChatMessage } from "@asterisk/shared";
import { useEffect, useRef, useState } from "react";
import { ApiCallError, api } from "./api";

export function Chat({
  token,
  assignment,
  onUnauthorized,
}: {
  token: string;
  assignment: StudentAssignment;
  onUnauthorized: () => void;
}) {
  const [messages, setMessages] = useState<StudentChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(undefined);
    api
      .history(token, assignment.id)
      .then((res) => !cancelled && setMessages(res.messages))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiCallError && err.status === 401) onUnauthorized();
        else {
          setMessages([]);
          setError(err instanceof ApiCallError ? err.message : "Couldn't load your chat.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, assignment.id, onUnauthorized]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  async function send() {
    const message = draft.trim();
    if (!message || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const res = await api.send(token, assignment.id, message);
      setMessages((list) => [...(list ?? []), res.studentMessage, res.reply]);
      setDraft("");
    } catch (err) {
      if (err instanceof ApiCallError && err.status === 401) return onUnauthorized();
      // Keep the draft so the student can retry.
      setError(err instanceof ApiCallError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-200 px-4 py-2">
        <p className="truncate font-medium">{assignment.title}</p>
        <p className="text-xs text-zinc-500">Help level: {HELP_LEVEL_LABELS[assignment.helpLevel]}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages === null && <p className="text-zinc-500">Loading…</p>}
        {messages?.length === 0 && (
          <div className="rounded-xl bg-accent-soft p-3 text-zinc-700">
            <p className="font-medium">Stuck on a step?</p>
            <p className="mt-1">
              Ask about it here. Asterisk won't hand you answers, but it'll help you find them, using your
              teacher's materials.
            </p>
          </div>
        )}
        {messages?.map((m) => <Bubble key={m.id} message={m} />)}
        {pending && <p className="text-zinc-500">Asterisk is thinking…</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex flex-col gap-2 border-t border-zinc-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        )}
        <textarea
          className="input min-h-16 resize-none"
          aria-label="Message Asterisk"
          placeholder="Ask about a step you're stuck on…"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="btn self-end" disabled={pending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: StudentChatMessage }) {
  const mine = message.role === "student";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 whitespace-pre-wrap text-white"
            : "max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 whitespace-pre-wrap"
        }
      >
        {message.content}
        {message.citations.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Sources">
            {message.citations.map((c) => (
              <li
                key={c.chunkId}
                className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700"
                title={`${c.sourceTitle} — ${c.ref}`}
              >
                📖 {c.sourceTitle} · {c.ref}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
