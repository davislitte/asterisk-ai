"use client";

import type { RubricCriterionInput, RubricLevel } from "@asterisk/shared";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type ImportRubricResult,
  type SaveRubricResult,
  importRubricFromFile,
  importRubricFromText,
  saveRubric,
} from "./actions";

interface Keyed<T> {
  key: number;
  value: T;
}
interface EditorCriterion {
  name: string;
  description: string;
  levels: Keyed<RubricLevel>[];
}

let nextKey = 0;
const keyed = <T,>(value: T): Keyed<T> => ({ key: nextKey++, value });

const toEditor = (c: RubricCriterionInput): Keyed<EditorCriterion> =>
  keyed({ name: c.name, description: c.description, levels: c.levels.map(keyed) });

const BLANK_CRITERION: RubricCriterionInput = {
  name: "",
  description: "",
  levels: [
    { label: "Exemplary", points: 3, description: "" },
    { label: "Proficient", points: 2, description: "" },
    { label: "Developing", points: 1, description: "" },
    { label: "Beginning", points: 0, description: "" },
  ],
};

export function RubricEditor({ assignmentId, initial }: { assignmentId: string; initial: RubricCriterionInput[] }) {
  const [criteria, setCriteria] = useState(() =>
    (initial.length > 0 ? initial : [BLANK_CRITERION]).map(toEditor),
  );
  const [result, setResult] = useState<SaveRubricResult>({});
  const [saving, startSaving] = useTransition();
  // DOM ids must match between server and client renders; list keys never reach the DOM.
  const uid = useId();
  const err = (path: string) => result.fieldErrors?.[path];

  const totalPoints = criteria.reduce(
    (sum, c) => sum + Math.max(0, ...c.value.levels.map((l) => l.value.points || 0)),
    0,
  );

  function updateCriterion(key: number, patch: Partial<EditorCriterion>) {
    setCriteria((list) => list.map((c) => (c.key === key ? { ...c, value: { ...c.value, ...patch } } : c)));
  }

  function updateLevel(criterionKey: number, levelKey: number, patch: Partial<RubricLevel>) {
    setCriteria((list) =>
      list.map((c) =>
        c.key !== criterionKey
          ? c
          : {
              ...c,
              value: {
                ...c.value,
                levels: c.value.levels.map((l) => (l.key === levelKey ? { ...l, value: { ...l.value, ...patch } } : l)),
              },
            },
      ),
    );
  }

  function applyImport(imported: RubricCriterionInput[]) {
    const hasContent = criteria.some((c) => c.value.name.trim());
    if (hasContent && !confirm("Replace the rubric below with the imported one?")) return;
    setCriteria(imported.map(toEditor));
    setResult({});
    toast.success(`Imported ${imported.length} criteria. Review them, then save.`);
  }

  function save() {
    const input = {
      criteria: criteria.map((c) => ({
        name: c.value.name,
        description: c.value.description,
        levels: c.value.levels.map((l) => l.value),
      })),
    };
    startSaving(async () => {
      const res = await saveRubric(assignmentId, input);
      setResult(res);
      if (res.ok) toast.success("Rubric saved");
      else toast.error(res.error ?? "Couldn't save the rubric");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <RubricImporter assignmentId={assignmentId} onImported={applyImport} />

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Criteria</h2>
        <p className="text-sm text-muted-foreground">{totalPoints} points total</p>
      </div>

      {criteria.map((c, ci) => (
        <Card key={c.key}>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-criterion-${ci}`}>Criterion {ci + 1}</Label>
                <Input
                  id={`${uid}-criterion-${ci}`}
                  value={c.value.name}
                  onChange={(e) => updateCriterion(c.key, { name: e.target.value })}
                  placeholder="e.g. Finds all roots"
                  aria-invalid={err(`criteria.${ci}.name`) ? true : undefined}
                />
                {err(`criteria.${ci}.name`) && <p className="text-sm text-destructive">{err(`criteria.${ci}.name`)}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-end"
                disabled={criteria.length === 1}
                onClick={() => setCriteria((list) => list.filter((x) => x.key !== c.key))}
              >
                Remove criterion
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-criterion-desc-${ci}`}>What it measures (optional)</Label>
              <Textarea
                id={`${uid}-criterion-desc-${ci}`}
                rows={2}
                value={c.value.description}
                onChange={(e) => updateCriterion(c.key, { description: e.target.value })}
              />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Levels</legend>
              {c.value.levels.map((l, li) => (
                <div key={l.key} className="grid gap-2 sm:grid-cols-[10rem_5rem_1fr_auto]">
                  <Input
                    aria-label={`Criterion ${ci + 1} level ${li + 1} label`}
                    value={l.value.label}
                    onChange={(e) => updateLevel(c.key, l.key, { label: e.target.value })}
                    placeholder="Label"
                    aria-invalid={err(`criteria.${ci}.levels.${li}.label`) ? true : undefined}
                  />
                  <Input
                    aria-label={`Criterion ${ci + 1} level ${li + 1} points`}
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isNaN(l.value.points) ? "" : l.value.points}
                    onChange={(e) => updateLevel(c.key, l.key, { points: e.target.valueAsNumber })}
                    aria-invalid={err(`criteria.${ci}.levels.${li}.points`) ? true : undefined}
                  />
                  <Input
                    aria-label={`Criterion ${ci + 1} level ${li + 1} description`}
                    value={l.value.description}
                    onChange={(e) => updateLevel(c.key, l.key, { description: e.target.value })}
                    placeholder="What this level looks like"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={c.value.levels.length === 1}
                    onClick={() =>
                      updateCriterion(c.key, { levels: c.value.levels.filter((x) => x.key !== l.key) })
                    }
                    aria-label={`Remove level ${li + 1}`}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  updateCriterion(c.key, {
                    levels: [...c.value.levels, keyed({ label: "", points: 0, description: "" })],
                  })
                }
              >
                Add level
              </Button>
            </fieldset>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => setCriteria((list) => [...list, toEditor(BLANK_CRITERION)])}>
          Add criterion
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save rubric"}
        </Button>
        {result.error && <p className="text-sm text-destructive">{result.error}</p>}
      </div>
    </div>
  );
}

function RubricImporter({
  assignmentId,
  onImported,
}: {
  assignmentId: string;
  onImported: (criteria: RubricCriterionInput[]) => void;
}) {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handle(run: () => Promise<ImportRubricResult>) {
    setError(undefined);
    startTransition(async () => {
      const res = await run();
      if (res.criteria) onImported(res.criteria);
      else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import an existing rubric</CardTitle>
        <CardDescription>
          Paste it or upload a file. Asterisk turns it into criteria below for you to review before saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === "text" ? "secondary" : "ghost"} onClick={() => setMode("text")}>
            Paste
          </Button>
          <Button type="button" size="sm" variant={mode === "file" ? "secondary" : "ghost"} onClick={() => setMode("file")}>
            Upload file
          </Button>
        </div>
        {mode === "text" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handle(() => importRubricFromText(assignmentId, text));
            }}
          >
            <Textarea
              aria-label="Rubric text"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a rubric table or list…"
            />
            <Button type="submit" variant="outline" disabled={pending || !text.trim()} className="self-start">
              {pending ? "Reading rubric…" : "Import"}
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              handle(() => importRubricFromFile(assignmentId, data));
            }}
          >
            <Input aria-label="Rubric file" name="file" type="file" accept=".pdf,.docx,.txt,.md" required />
            <Button type="submit" variant="outline" disabled={pending} className="self-start">
              {pending ? "Reading rubric…" : "Import"}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
