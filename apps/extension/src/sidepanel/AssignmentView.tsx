import { HELP_LEVEL_LABELS, type StudentAssignment } from "@asterisk/shared";
import { useState } from "react";
import { Chat } from "./Chat";
import { CheckWork } from "./CheckWork";
import { Finish } from "./Finish";
import { Photo } from "./Photo";
import type { Draft } from "./read-doc";

type Tab = "ask" | "check" | "photo" | "finish";

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
              ["photo", "Photo"],
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
      {/* All tabs stay mounted so switching keeps typed answers, feedback and scroll position. */}
      <Panel shown={tab === "ask"}>
        <Chat token={token} assignment={assignment} draft={draft} onDraftChange={setDraft} onUnauthorized={onUnauthorized} />
      </Panel>
      <Panel shown={tab === "check"}>
        <CheckWork token={token} assignment={assignment} draft={draft} onDraftChange={setDraft} onUnauthorized={onUnauthorized} />
      </Panel>
      <Panel shown={tab === "photo"}>
        <Photo token={token} assignment={assignment} onUnauthorized={onUnauthorized} />
      </Panel>
      <Panel shown={tab === "finish"}>
        <Finish token={token} assignment={assignment} onUnauthorized={onUnauthorized} />
      </Panel>
    </div>
  );
}

function Panel({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div role="tabpanel" hidden={!shown} className={shown ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
      {children}
    </div>
  );
}
