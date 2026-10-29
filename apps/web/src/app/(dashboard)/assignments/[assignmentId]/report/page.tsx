import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import type { AgentStep } from "@/server/ai";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { type StoredClassReport, getLatestClassReport, sectionUsage } from "@/server/reports/class-report";
import { type ClassWork, type StudentWork, flagCounts, loadClassWork } from "@/server/reports/class-work";
import { GenerateReportButton } from "./generate-button";

// The class report agent makes several Muse Spark calls; give the server action room.
export const maxDuration = 300;

const LEVEL_STYLE: Record<string, string> = {
  none: "bg-destructive/10 text-destructive",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  solid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  strong: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-300",
};

export default async function ReportPage({ params }: PageProps<"/assignments/[assignmentId]/report">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();
  const [work, report] = await Promise.all([
    loadClassWork(assignment.id, assignment.classId),
    getLatestClassReport(assignment.id),
  ]);

  const nameById = new Map(work.students.map((s) => [s.id, s.name]));
  const nameOf = (label: string) => (report ? nameById.get(report.labels[label] ?? "") : undefined) ?? label;
  const notes = new Map(report?.report.studentNotes.map((n) => [report.labels[n.student], n.note]) ?? []);
  const base = `/assignments/${assignment.id}/report`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-muted-foreground">
          Where your class&apos;s understanding breaks down. Muse Spark reads every draft, chat and comprehension answer
          with read-only tools, then each claim is checked against your students&apos; actual work.
        </p>
        <GenerateReportButton assignmentId={assignment.id} hasReport={Boolean(report)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Students" value={work.students.length} />
        <Stat label="Ran a rubric check" value={work.students.filter((s) => s.latestCheck).length} />
        <Stat label="Submitted" value={work.students.filter((s) => s.submittedAt).length} />
        <Stat
          label="Flagged messages"
          value={work.students.reduce((n, s) => n + s.messages.filter((m) => m.flags.length > 0).length, 0)}
        />
      </div>

      {report ? (
        <ClassReportView report={report} work={work} nameOf={nameOf} />
      ) : (
        <Card>
          <CardContent className="text-muted-foreground">
            No class report yet. Build one once students have chatted, checked their work or answered the
            comprehension questions.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
          <CardDescription>Open a student for their drafts, answers and messages.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {work.students.length === 0 ? (
            <p className="text-muted-foreground">No students have joined this class yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Student</th>
                  <th className="py-2 pr-4 font-medium">Rubric check</th>
                  <th className="py-2 pr-4 font-medium">Comprehension</th>
                  <th className="py-2 pr-4 text-right font-medium">Messages</th>
                  <th className="py-2 pr-4 text-right font-medium">Flags</th>
                  <th className="py-2 font-medium">Needs work on</th>
                </tr>
              </thead>
              <tbody>
                {work.students.map((s) => (
                  <tr key={s.id} className="border-t align-top">
                    <td className="py-2 pr-4">
                      <Link href={`${base}/students/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      {s.submittedAt && <span className="ml-2 text-xs text-muted-foreground">submitted</span>}
                    </td>
                    <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                      <RubricCell s={s} />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-1">
                        {s.answers.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          s.answers.map((a) => (
                            <span
                              key={a.question}
                              title={`Q${a.question}: ${a.understanding ?? "ungraded"}`}
                              className={`rounded px-1.5 py-0.5 text-xs ${LEVEL_STYLE[a.understanding ?? ""] ?? "bg-muted"}`}
                            >
                              Q{a.question}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{s.messages.length}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{flagTotal(s) || <span className="text-muted-foreground">0</span>}</td>
                    <td className="py-2 text-muted-foreground">{notes.get(s.id) ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClassReportView({
  report,
  work,
  nameOf,
}: {
  report: StoredClassReport;
  work: ClassWork;
  nameOf: (label: string) => string;
}) {
  const { misconceptions, reteachPlan } = report.report;
  const why = new Map(report.report.sourceSections.map((s) => [s.ref.trim().toLowerCase(), s.why]));
  const sections = sectionUsage(work).filter((u) => u.replies > 0 || why.has(u.ref.toLowerCase()));
  const { droppedQuotes, droppedStudentRefs, droppedMisconceptions } = report.report.verification;
  const addedByRecount = report.report.verification.addedByRecount ?? 0;
  const removed = droppedQuotes + droppedStudentRefs + droppedMisconceptions;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            Built <LocalDateTime iso={report.createdAt.toISOString()} /> from {report.studentCount} students ·{" "}
            {report.steps.length} tool calls · {(report.latencyMs / 1000).toFixed(0)} s · ${report.costUsd.toFixed(3)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{report.report.summary}</p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Common misconceptions</h2>
        {misconceptions.length === 0 && <p className="text-muted-foreground">No shared misconception stood out.</p>}
        <ol className="flex flex-col gap-3">
          {misconceptions.map((m, i) => (
            <li key={i}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <CardTitle className="text-base">
                      {i + 1}. {m.title}
                    </CardTitle>
                    <span className="text-2xl font-semibold tabular-nums">
                      {m.students.length}
                      <span className="text-base font-normal text-muted-foreground">/{report.studentCount} students</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((m.students.length / Math.max(1, report.studentCount)) * 100)}%` }}
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p>{m.explanation}</p>
                  {m.problemIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.problemIds.map((p) => (
                        <Badge key={p} variant="secondary">
                          Problem {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {m.evidence.length > 0 && (
                    <ul className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
                      {groupQuotes(m.evidence).map((e) => (
                        <li key={e.quote}>
                          “{e.quote}”{" "}
                          <span className="text-muted-foreground">— {e.students.map(nameOf).join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Which students</summary>
                    <p className="mt-2">{m.students.map(nameOf).sort().join(", ")}</p>
                  </details>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Reteach plan</CardTitle>
          <CardDescription>{reteachPlan.goal}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3">
            {reteachPlan.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{s.minutes} min</span>
                <div className="flex flex-col gap-1">
                  <p>{s.activity}</p>
                  {s.addresses.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.addresses.map((n) => (
                        <Badge key={n} variant="outline">
                          {misconceptions[n - 1]?.title ?? `#${n}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p className="rounded-md bg-muted/50 p-3 text-sm">
            <span className="font-medium">Exit ticket:</span> {reteachPlan.exitTicket}
          </p>
        </CardContent>
      </Card>

      {sections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Note sections that drew questions</CardTitle>
            <CardDescription>Counted from the sections Asterisk cited when it helped students.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Section</th>
                  <th className="py-2 pr-4 text-right font-medium">Replies citing it</th>
                  <th className="py-2 pr-4 text-right font-medium">Students</th>
                  <th className="py-2 font-medium">Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((u) => (
                  <tr key={u.ref} className="border-t align-top">
                    <td className="py-2 pr-4 font-medium">{u.ref}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{u.replies}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{u.students.size}</td>
                    <td className="py-2 text-muted-foreground">{why.get(u.ref.toLowerCase()) ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">How Asterisk built this report</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted-foreground">
            Muse Spark worked as an agent: it chose these {report.steps.length} read-only tool calls over{" "}
            {report.rounds} turns{report.finishedInvestigating ? "" : " (it hit its tool budget)"} and wrote the report.
            Then it recounted each misconception against every student&apos;s work
            {addedByRecount > 0 ? `, which added ${addedByRecount} student${addedByRecount === 1 ? "" : "s"} the investigation hadn't opened` : ""}.
            Students appear to the model only as &quot;Student 01&quot;, &quot;Student 02&quot; and so on, never by name.
            Every quote was matched word for word against that student&apos;s own work, and a recounted student only
            counts if their quote matched
            {removed > 0 ? `; verification removed ${describeRemoved(droppedQuotes, droppedStudentRefs, droppedMisconceptions)}` : ""}.
          </p>
          <ol className="list-decimal pl-5">
            {report.steps.map((s, i) => (
              <li key={i} className={s.ok ? "" : "text-muted-foreground"}>
                {describeStep(s, work, nameOf)}
                {!s.ok && ` (failed: ${s.error})`}
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground">
            {report.usage.tokensIn.toLocaleString()} tokens in, {report.usage.tokensOut.toLocaleString()} out ·{" "}
            {report.promptVersion}
          </p>
        </div>
      </details>
    </div>
  );
}

/** Several students can write the same sentence; show it once with all their names. */
function groupQuotes(evidence: { student: string; quote: string }[]) {
  const byQuote = new Map<string, { quote: string; students: string[] }>();
  for (const e of evidence) {
    const key = e.quote.toLowerCase();
    const entry = byQuote.get(key) ?? { quote: e.quote, students: [] };
    if (!entry.students.includes(e.student)) entry.students.push(e.student);
    byQuote.set(key, entry);
  }
  return [...byQuote.values()];
}

function describeRemoved(quotes: number, refs: number, misconceptions: number): string {
  const parts = [
    quotes && `${quotes} quote${quotes === 1 ? "" : "s"} not found in the work`,
    refs && `${refs} reference${refs === 1 ? "" : "s"} to unknown students`,
    misconceptions && `${misconceptions} unsupported misconception${misconceptions === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(", ");
}

function describeStep(step: AgentStep, work: ClassWork, nameOf: (label: string) => string): string {
  const args = (step.args ?? {}) as Record<string, unknown>;
  switch (step.tool) {
    case "class_overview":
      return "Read the class overview";
    case "get_student_work":
      return `Opened ${String(args.student)}'s work (${nameOf(String(args.student))})`;
    case "search_class_work":
      return `Searched all work for ${Array.isArray(args.terms) ? args.terms.map((t) => `“${t}”`).join(", ") : "…"}`;
    case "get_rubric_criterion":
      return `Read every student's level on “${work.criteria[Number(args.criterion) - 1] ?? `criterion ${String(args.criterion)}`}”`;
    case "get_comprehension_question":
      return `Read every answer to comprehension question ${String(args.question)}`;
    case "get_source_section_usage":
      return "Checked which note sections drew questions";
    default:
      return step.tool;
  }
}

function RubricCell({ s }: { s: StudentWork }) {
  if (!s.latestCheck) return <span className="text-muted-foreground">—</span>;
  const { totalPoints, maxPoints } = s.latestCheck;
  return (
    <>
      {totalPoints}/{maxPoints}
      {s.checkCount > 1 && s.firstCheckPoints !== null && s.firstCheckPoints !== totalPoints && (
        <span className="ml-1 text-xs text-muted-foreground">(first {s.firstCheckPoints})</span>
      )}
    </>
  );
}

function flagTotal(s: StudentWork): number {
  const f = flagCounts(s);
  return f.answerSeeking + f.jailbreak + f.offTopic;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
