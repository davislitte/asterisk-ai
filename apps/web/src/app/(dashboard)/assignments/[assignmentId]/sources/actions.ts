"use server";

import { PastedTextSourceInput, UrlSourceInput } from "@asterisk/shared";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { sourceChunks, sources } from "@/db/schema";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { chunkSections } from "@/server/sources/chunk";
import { ExtractionError } from "@/server/sources/extract";
import { UrlFetchError } from "@/server/sources/fetch-url";
import { type ImportedSource, importFile, importPastedText, importUrl } from "@/server/sources/import";
import { deleteSourceFile, uploadSourceFile } from "@/server/storage";

export interface SourceActionResult {
  error?: string;
  added?: { title: string; chunkCount: number };
}

async function ownedAssignment(assignmentId: string) {
  const teacher = await requireTeacher();
  return getAssignmentForTeacher(teacher.id, assignmentId);
}

async function save(assignmentId: string, src: ImportedSource, fileKey: string | null): Promise<SourceActionResult> {
  const chunks = chunkSections(src.sections);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sources)
      .values({
        assignmentId,
        kind: src.kind,
        title: src.title,
        url: src.url ?? null,
        fileKey,
        extractedText: src.sections.map((s) => `${s.ref}\n${s.text}`).join("\n\n"),
      })
      .returning({ id: sources.id });
    await tx
      .insert(sourceChunks)
      .values(chunks.map((c, i) => ({ sourceId: row!.id, ref: c.ref, ordinal: i, text: c.text })));
  });
  revalidatePath(`/assignments/${assignmentId}`, "layout");
  return { added: { title: src.title, chunkCount: chunks.length } };
}

function friendly(err: unknown): SourceActionResult {
  if (err instanceof ExtractionError || err instanceof UrlFetchError) return { error: err.message };
  console.error("[sources] import failed", err);
  return { error: "Something went wrong adding that source. Please try again." };
}

export async function addFileSource(assignmentId: string, formData: FormData): Promise<SourceActionResult> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment) return { error: "Assignment not found" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload." };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const src = await importFile(file.name, file.type, bytes);
    const fileKey = await uploadSourceFile(assignment.id, file.name, bytes, file.type);
    return await save(assignment.id, src, fileKey);
  } catch (err) {
    return friendly(err);
  }
}

export async function addTextSource(assignmentId: string, input: unknown): Promise<SourceActionResult> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment) return { error: "Assignment not found" };
  const parsed = PastedTextSourceInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    return await save(assignment.id, importPastedText(parsed.data.title, parsed.data.text), null);
  } catch (err) {
    return friendly(err);
  }
}

export async function addUrlSource(assignmentId: string, input: unknown): Promise<SourceActionResult> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment) return { error: "Assignment not found" };
  const parsed = UrlSourceInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid URL" };

  try {
    return await save(assignment.id, await importUrl(parsed.data.url), null);
  } catch (err) {
    return friendly(err);
  }
}

export async function deleteSource(assignmentId: string, sourceId: string): Promise<{ error?: string }> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment || !z.uuid().safeParse(sourceId).success) return { error: "Source not found" };

  const [deleted] = await db
    .delete(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.assignmentId, assignment.id)))
    .returning({ fileKey: sources.fileKey });
  if (!deleted) return { error: "Source not found" };
  if (deleted.fileKey) await deleteSourceFile(deleted.fileKey);
  revalidatePath(`/assignments/${assignment.id}`, "layout");
  return {};
}
