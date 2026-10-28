import { HELP_LEVEL_LABELS, type StudentAssignment } from "@asterisk/shared";
import { useState } from "react";
import { Chat } from "./Chat";
import { CheckWork } from "./CheckWork";
import { Finish } from "./Finish";
import type { Draft } from "./read-doc";

type Tab = "ask" | "check" | "finish";

export function AssignmentView({
  token,
  assignment,
  onUnauthorized,
}: {
  token: string;
  assignment: StudentAssignment;
  onUnauthorized: () => void;
}) {
  const [tab, setTab] = useState<Tab>("ask");
  // Read once, used by both tabs. Kept in memory only; never saved by the extension.
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-200 px-4 pt-2">
        <p className="truncate font-medium">{assignment.title}</p>
        <p className="text-xs text-zinc-500">Help level: {HELP_LEVEL_LABELS[assignment.helpLevel]}</p>
        <div role="tablist" aria-label="Assignment tools" className="mt-2 flex gap-1">
          {(
            [
              ["ask", "Ask"],
              ["check", "Check my work"],
              ["finish", "Finish"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? "-mb-px border-b-2 border-accent px-2 py-1.5 text-xs font-semibold"
                  : "-mb-px border-b-2 border-transparent px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-900"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "ask" ? (
        <Chat token={token} assignment={assignment} draft={draft} onDraftChange={setDraft} onUnauthorized={onUnauthorized} />
      ) : tab === "check" ? (
        <CheckWork token={token} assignment={assignment} draft={draft} onDraftChange={setDraft} onUnauthorized={onUnauthorized} />
      ) : (
        <Finish token={token} assignment={assignment} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
}
