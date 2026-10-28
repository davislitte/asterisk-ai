import { useState } from "react";
import { type Draft, readActiveGoogleDoc, wordCount } from "./read-doc";

/** Shows the attached draft, or lets the student read their Google Doc / paste their work. */
export function DraftPicker({
  draft,
  onChange,
  allowPaste = false,
  compact = false,
}: {
  draft: Draft | null;
  onChange: (draft: Draft | null) => void;
  allowPaste?: boolean;
  compact?: boolean;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  async function readDoc() {
    setReading(true);
    setError(undefined);
    const result = await readActiveGoogleDoc();
    setReading(false);
    if (result.ok) onChange(result.draft);
    else setError(result.error);
  }

  if (draft) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-xs">
        <span className="min-w-0 truncate">
          📄 Using {draft.source === "google_doc" ? `“${draft.title}”` : "your pasted work"} · {wordCount(draft.text)} words
        </span>
        <span className="flex shrink-0 gap-1">
          {draft.source === "google_doc" && (
            <button type="button" className="btn-ghost" onClick={readDoc} disabled={reading}>
              {reading ? "Reading…" : "Refresh"}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => onChange(null)} aria-label="Stop sharing your work">
            Remove
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
        <button type="button" className={compact ? "btn-ghost border border-zinc-200" : "btn"} onClick={readDoc} disabled={reading}>
          {reading ? "Reading your doc…" : compact ? "📄 Share my doc" : "📄 Read my Google Doc"}
        </button>
        {allowPaste && !pasting && (
          <button type="button" className="btn-ghost self-start" onClick={() => setPasting(true)}>
            Paste my work instead
          </button>
        )}
      </div>
      {pasting && (
        <div className="flex flex-col gap-2">
          <textarea
            className="input min-h-28"
            aria-label="Paste your work"
            placeholder="Paste your work here…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button
            type="button"
            className="btn self-end"
            disabled={!pasted.trim()}
            onClick={() => onChange({ text: pasted.trim(), title: "Pasted work", source: "pasted" })}
          >
            Use this
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {!compact && <p className="text-xs text-zinc-500">Asterisk only reads your doc when you click, and never edits it.</p>}
    </div>
  );
}
