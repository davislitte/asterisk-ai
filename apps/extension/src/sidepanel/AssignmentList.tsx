import { HELP_LEVEL_LABELS, type StudentAssignment } from "@asterisk/shared";

export function AssignmentList({
  assignments,
  onSelect,
}: {
  assignments: StudentAssignment[];
  onSelect: (id: string) => void;
}) {
  if (assignments.length === 0) {
    return <p className="p-6 text-zinc-600">Your teacher hasn't posted any assignments yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Which assignment are you working on?</h2>
      <ul className="flex flex-col gap-2">
        {assignments.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect(a.id)}
              className="w-full rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <span className="block font-medium">{a.title}</span>
              <span className="text-xs text-zinc-500">
                {a.subject} · Help: {HELP_LEVEL_LABELS[a.helpLevel]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** S2: shown when the current tab isn't on the assignment's allowlist. */
export function NotEnabled({ url, allowlist }: { url: string | null; allowlist: string[] }) {
  let host = "this page";
  try {
    if (url) host = new URL(url).hostname || host;
  } catch {
    // keep default
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div aria-hidden className="text-3xl text-zinc-300">
        *
      </div>
      <p className="font-medium">Asterisk isn't enabled here by your teacher.</p>
      <p className="text-zinc-600">
        It's off on <span className="font-mono">{host}</span>. Switch to a page your teacher allowed:
      </p>
      <ul className="flex flex-col gap-1 font-mono text-xs text-zinc-700">
        {allowlist.map((p) => (
          <li key={p} className="rounded bg-zinc-100 px-2 py-1">
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
