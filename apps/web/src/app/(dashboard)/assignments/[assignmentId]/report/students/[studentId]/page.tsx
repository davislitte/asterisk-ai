import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { getLatestClassReport } from "@/server/reports/class-report";
import { flagCounts, loadClassWork } from "@/server/reports/class-work";
import { listChatHistory } from "@/server/student/data";

const FLAG_LABEL: Record<string, string> = {
  answer_seeking: "Asked for the answer",
  jailbreak: "Tried to bypass rules",
  off_topic: "Off-topic",
};

export default async function StudentReportPage({
  params,
}: PageProps<"/assignments/[assignmentId]/report/students/[studentId]">) {
  const { assignmentId, studentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();
  const [work, report] = await Promise.all([
    loadClassWork(assignment.id, assignment.classId),
    getLatestClassReport(assignment.id),
  ]);
  // Only students in this assignment's class.
  const s = work.students.find((x) => x.id === studentId);
  if (!s) notFound();
  const chat = await listChatHistory(s.id, assignment.id, 200);

  const label = report ? Object.entries(report.labels).find(([, id]) => id === s.id)?.[0] : undefined;
  const note = label ? report?.report.studentNotes.find((n) => n.student === label)?.note : undefined;
  const misconceptions = label ? (report?.report.misconceptions.filter((m) => m.students.includes(label)) ?? []) : [];
  const flags = flagCounts(s);
  const flagsById = new Map(s.messages.map((m) => [m.id, m.flags]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/assignments/${assignment.id}/report`} className="text-sm text-muted-foreground hover:underline">
          ← Class report
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{s.name}</h2>
        <p className="text-sm text-muted-foreground">
          {s.submittedAt ? (
            <>
              Submitted <LocalDateTime iso={s.submittedAt.toISOString()} />
            </>
          ) : (
            "Not submitted yet"
          )}
          {" · "}
          {s.messages.length} messages to Asterisk · {s.checkCount} rubric check{s.checkCount === 1 ? "" : "s"}
        </p>
      </div>

      {(note || misconceptions.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Struggled with</CardTitle>
            <CardDescription>From the latest class report.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {note && <p>{note}</p>}
            {misconceptions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {misconceptions.map((m) => (
                  <Badge key={m.title} variant="secondary">
                    {m.title}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rubric pre-check</CardTitle>
          <CardDescription>
            {s.latestCheck ? (
              <>
                Latest: {s.latestCheck.totalPoints}/{s.latestCheck.maxPoints}
                {s.checkCount > 1 && ` (first check: ${s.firstCheckPoints}/${s.latestCheck.maxPoints})`} ·{" "}
                <LocalDateTime iso={s.latestCheck.createdAt.toISOString()} />
              </>
            ) : (
              "No rubric check yet."
            )}
          </CardDescription>
        </CardHeader>
        {s.latestCheck && (
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-3">
              {s.latestCheck.criteria.map((c) => (
                <li key={c.name} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="outline">
                      {c.level} · {c.points}/{c.maxPoints}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Feedback given: {c.nextStep}</p>
                </li>
              ))}
            </ul>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Draft that was checked</summary>
              <pre className="mt-2 rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{s.latestCheck.draft}</pre>
            </details>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comprehension check</CardTitle>
          <CardDescription>Written answers, graded by Muse Spark for understanding.</CardDescription>
        </CardHeader>
        <CardContent>
          {s.answers.length === 0 ? (
            <p className="text-muted-foreground">Not answered yet.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {s.answers.map((a) => (
                <li key={a.question} className="flex flex-col gap-1">
                  <p className="font-medium">
                    Q{a.question}. {a.text}
                  </p>
                  <p className="whitespace-pre-wrap">“{a.answer}”</p>
                  <p className="text-sm text-muted-foreground">
                    <Badge variant={a.understanding === "none" ? "destructive" : "secondary"}>
                      {a.understanding ?? "ungraded"}
                    </Badge>{" "}
                    {a.rationale}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversation with Asterisk</CardTitle>
          <CardDescription>
            {flags.answerSeeking} asked for the answer · {flags.jailbreak} tried to bypass rules · {flags.offTopic}{" "}
            off-topic
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chat.length === 0 ? (
            <p className="text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {chat.map((m) => {
                const mFlags = flagsById.get(m.id) ?? [];
                return (
                  <li
                    key={m.id}
                    className={`max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap ${
                      m.role === "student" ? "self-end bg-primary/10" : "self-start bg-muted/60"
                    }`}
                  >
                    {mFlags.length > 0 && (
                      <span className="mb-1 flex flex-wrap gap-1">
                        {mFlags.map((f) => (
                          <Badge key={f} variant={f === "jailbreak" ? "destructive" : "secondary"}>
                            {FLAG_LABEL[f] ?? f}
                          </Badge>
                        ))}
                      </span>
                    )}
                    {m.content}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
