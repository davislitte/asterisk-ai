import type { PhotoFeedbackResponse, PhotoStatus, StudentAssignment } from "@asterisk/shared";
import { useEffect, useRef, useState } from "react";
import { ApiCallError, api } from "./api";

const MAX_SIDE = 1600;

const STATUS: Record<PhotoStatus, { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-emerald-50 text-emerald-800" },
  revisit: { label: "Take another look", className: "bg-amber-50 text-amber-800" },
  incomplete: { label: "Unfinished", className: "bg-zinc-100 text-zinc-700" },
};

/** Shrinks the photo in the panel (≤1600 px JPEG) so uploads stay small and fast. */
async function toJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** S5: feedback on a photo of handwritten work, problem by problem. It never solves the problems. */
export function Photo({
  token,
  assignment,
  onUnauthorized,
}: {
  token: string;
  assignment: StudentAssignment;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<PhotoFeedbackResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .photo(token, assignment.id)
      .then((res) => !cancelled && setData(res))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiCallError && err.status === 401) onUnauthorized();
        else setData({ latest: null });
      });
    return () => {
      cancelled = true;
    };
  }, [token, assignment.id, onUnauthorized]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    let image: string;
    try {
      image = await toJpegDataUrl(file);
    } catch {
      setError("That file couldn't be opened as a photo. Try a JPEG or PNG.");
      return;
    }
    setPreview(image);
    setPending(true);
    try {
      setData(await api.sendPhoto(token, assignment.id, { image }));
    } catch (err) {
      if (err instanceof ApiCallError && err.status === 401) return onUnauthorized();
      setError(err instanceof ApiCallError ? err.message : "Couldn't check your photo. Try again.");
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  const latest = data?.latest;
  const prompts = new Map(assignment.problems.map((p) => [p.id, p.prompt]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Get feedback on handwritten work</h2>
        <p className="text-zinc-600">
          Take a photo of your worksheet. Asterisk reads each problem and tells you what to look at again. It won't solve
          them for you.
        </p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          id="photo-input"
          onChange={(e) => void choose(e.target.files?.[0])}
          disabled={pending}
        />
        <label htmlFor="photo-input" className={`btn text-center ${pending ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          {pending ? "Reading your work…" : latest ? "Check another photo" : "Choose a photo"}
        </label>
        <p className="text-xs text-zinc-500">
          Your photo isn't saved. Your teacher can see what Asterisk read and the feedback you got.
        </p>
        {preview && pending && <img src={preview} alt="Your photo" className="max-h-48 rounded-lg border border-zinc-200 object-contain" />}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        )}
      </div>

      {latest && (
        <section aria-label="Photo feedback" className="flex flex-col gap-3">
          <h3 className="font-semibold">Feedback</h3>
          {latest.overall && <p className="rounded-lg bg-accent-soft p-3">{latest.overall}</p>}
          <ul className="flex flex-col gap-2">
            {latest.problems.map((p) => (
              <li key={p.problemId} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">Problem {p.problemId}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS[p.status].className}`}>
                    {STATUS[p.status].label}
                  </span>
                </div>
                {prompts.get(p.problemId) && <p className="mt-1 text-xs text-zinc-500">{prompts.get(p.problemId)}</p>}
                <p className="mt-2 text-zinc-700">{p.feedback}</p>
                <details className="mt-2 text-xs text-zinc-600">
                  <summary className="cursor-pointer">What Asterisk read</summary>
                  <pre className="mt-1 rounded-lg bg-zinc-50 p-2 font-mono whitespace-pre-wrap">{p.reading}</pre>
                </details>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">If Asterisk misread something, retake the photo in better light.</p>
        </section>
      )}
    </div>
  );
}
