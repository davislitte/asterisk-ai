import { JoinRequest, type JoinResponse } from "@asterisk/shared";
import { useState } from "react";
import { ApiCallError, api } from "./api";

export function JoinScreen({ onJoined, notice }: { onJoined: (session: JoinResponse) => void; notice?: string }) {
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(notice);
  const [pending, setPending] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = JoinRequest.safeParse({ joinCode, displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      onJoined(await api.join(parsed.data));
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Couldn't join. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex h-full flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Asterisk<span className="text-accent">*</span>
        </h1>
        <p className="mt-1 text-zinc-600">Your teacher's study helper. Join your class to start.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Class code</span>
          <input
            className="input font-mono text-lg tracking-[0.3em] uppercase"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABC123"
            autoComplete="off"
            autoFocus
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Your name</span>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="First name or nickname"
            maxLength={40}
            required
          />
          <span className="text-xs text-zinc-500">Only your teacher sees this. Asterisk never asks for your email.</span>
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Joining…" : "Join class"}
        </button>
      </form>
    </main>
  );
}
