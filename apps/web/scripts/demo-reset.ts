/**
 * `pnpm demo:reset` — puts the demo class (join code QUAD24) back to what the
 * seed scripts made, between demo takes. Removes from that class only:
 *   - assignments other than the seeded quadratics one (with their sources,
 *     uploaded files, chats, checks and answers), and
 *   - students the seeds didn't add (with everything they did).
 * The seeded assignment, its stored class report and the seeded students stay.
 *
 * Dry run by default: it lists what it would delete. Pass --apply to delete.
 */
import { createClient } from "@supabase/supabase-js";
import { and, count, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db, sqlClient } from "../src/db/client";
import {
  assignments,
  chatMessages,
  classes,
  rubricChecks,
  sources,
  students,
  submissions,
  workPhotos,
} from "../src/db/schema";
import { DEMO_ASSIGNMENT_TITLE, DEMO_JOIN_CODE, ROSTER, SEED_STUDENTS } from "./demo-class";

const SOURCES_BUCKET = "sources";

async function main() {
  const apply = process.argv.includes("--apply");

  const klass = await db.query.classes.findFirst({ where: eq(classes.joinCode, DEMO_JOIN_CODE) });
  if (!klass) throw new Error(`No class with join code ${DEMO_JOIN_CODE}. Run pnpm db:seed first.`);
  const seeded = await db.query.assignments.findFirst({
    where: and(eq(assignments.classId, klass.id), eq(assignments.title, DEMO_ASSIGNMENT_TITLE)),
  });
  if (!seeded) throw new Error(`"${DEMO_ASSIGNMENT_TITLE}" is missing. Run pnpm db:seed first.`);

  const extraAssignments = await db
    .select({ id: assignments.id, title: assignments.title, createdAt: assignments.createdAt })
    .from(assignments)
    .where(and(eq(assignments.classId, klass.id), ne(assignments.id, seeded.id)));
  const files = extraAssignments.length
    ? (
        await db
          .select({ fileKey: sources.fileKey })
          .from(sources)
          .where(inArray(sources.assignmentId, extraAssignments.map((a) => a.id)))
      ).flatMap((s) => (s.fileKey ? [s.fileKey] : []))
    : [];

  const keep = [...SEED_STUDENTS, ...ROSTER.map(([name]) => name)];
  const extraStudents = await db
    .select({ id: students.id, name: students.displayName })
    .from(students)
    .where(and(eq(students.classId, klass.id), notInArray(students.displayName, keep)));

  console.info(`Demo class "${klass.name}" (${DEMO_JOIN_CODE}). Keeping "${seeded.title}" and the seeded students.`);
  if (extraAssignments.length === 0 && extraStudents.length === 0) {
    console.info("Nothing to remove; the class is already as seeded.");
    return;
  }

  const verb = apply ? "Removing" : "Would remove";
  if (extraAssignments.length) {
    console.info(`\n${verb} ${extraAssignments.length} assignment(s) and all student work on them:`);
    for (const a of extraAssignments) console.info(`  - "${a.title}" (created ${a.createdAt.toISOString()})`);
    if (files.length) console.info(`  plus ${files.length} uploaded source file(s) in storage`);
  }
  if (extraStudents.length) {
    console.info(`\n${verb} ${extraStudents.length} student(s) and everything they did:`);
    for (const s of extraStudents) console.info(`  - ${s.name}: ${await activity(s.id)}`);
  }

  if (!apply) {
    console.info("\nDry run. Nothing was deleted. Run `pnpm demo:reset --apply` to delete these.");
    return;
  }

  await db.transaction(async (tx) => {
    // Both cascade to everything below them.
    if (extraStudents.length) await tx.delete(students).where(inArray(students.id, extraStudents.map((s) => s.id)));
    if (extraAssignments.length)
      await tx.delete(assignments).where(inArray(assignments.id, extraAssignments.map((a) => a.id)));
  });
  await removeFiles(files);
  console.info("\nDone. The demo class is back to its seeded state.");
}

async function activity(studentId: string): Promise<string> {
  const counted = async (table: typeof chatMessages | typeof rubricChecks | typeof workPhotos | typeof submissions) =>
    (await db.select({ n: count() }).from(table).where(eq(table.studentId, studentId)))[0]?.n ?? 0;
  const [messages, checks, photos, submitted] = await Promise.all([
    counted(chatMessages),
    counted(rubricChecks),
    counted(workPhotos),
    counted(submissions),
  ]);
  return `${messages} chat messages, ${checks} rubric checks, ${photos} photos, ${submitted} submissions`;
}

async function removeFiles(keys: string[]) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (keys.length === 0 || !url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.storage.from(SOURCES_BUCKET).remove(keys);
  if (error) console.error(`Couldn't remove ${keys.length} uploaded file(s) from storage:`, error.message);
}

main()
  .catch((err) => {
    console.error("Demo reset failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
