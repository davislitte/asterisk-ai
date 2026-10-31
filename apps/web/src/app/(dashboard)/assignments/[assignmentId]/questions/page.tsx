import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { listCheckQuestions, listComprehensionResponses } from "@/server/check-questions";
import { QuestionsEditor } from "./questions-editor";

const LEVEL_LABEL = ["No understanding", "Partial", "Solid", "Strong"];
const LEVEL_STYLE = [
  "bg-destructive/10 text-destructive",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "bg-emerald-600/20 text-emerald-800 dark:text-emerald-300",
];

export default async function QuestionsPage({ params }: PageProps<"/assignments/[assignmentId]/questions">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();
  const [questions, responses] = await Promise.all([
    listCheckQuestions(assignment.id),
    listComprehensionResponses(assignment.id, assignment.classId),
  ]);
  const questionText = new Map(questions.map((q, i) => [q.id, `Q${i + 1}. ${q.text}`]));
  const questionNumber = new Map(questions.map((q, i) => [q.id, i + 1]));
  const submitted = responses.filter((r) => r.submittedAt);
  const scores = submitted.flatMap((r) => r.answers);
  const summary = questions
    .map((q, i) => ({
      number: i + 1,
      text: q.text,
      counts: LEVEL_LABEL.map((_, level) => scores.filter((a) => a.questionId === q.id && a.score === level).length),
    }))
    .filter((q) => q.counts.some((n) => n > 0));

  return (
    <div className="flex flex-col gap-6">
      <QuestionsEditor assignmentId={assignment.id} endCheckEnabled={assignment.endCheckEnabled} initial={questions} />

      <Card>
        <CardHeader>
          <CardTitle>Responses</CardTitle>
          <CardDescription>
            {submitted.length} of {responses.length} students have marked this assignment complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {submitted.length === 0 ? (
            <p className="text-muted-foreground">No submissions yet.</p>
          ) : (
            <>
              {summary.length > 0 && (
                <div className="flex flex-col gap-3">
                  {summary.map((q) => (
                    <div key={q.number} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                      <p className="text-sm sm:w-1/2">
                        <span className="font-medium">Q{q.number}.</span>{" "}
                        <span className="text-muted-foreground">{q.text}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...q.counts.entries()].reverse().map(([level, n]) =>
                          n > 0 ? (
                            <span key={level} className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${LEVEL_STYLE[level]}`}>
                              {n} {LEVEL_LABEL[level]}
                            </span>
                          ) : null,
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col divide-y rounded-lg border">
                {submitted.map((r) => (
                  <details key={r.studentId} className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
                      <span className="font-medium">{r.name}</span>
                      <span className="flex gap-1">
                        {r.answers.map((a) => (
                          <span
                            key={a.questionId}
                            title={a.score === null ? "Not graded" : LEVEL_LABEL[a.score]}
                            className={`rounded px-1.5 py-0.5 text-xs ${a.score === null ? "bg-muted" : (LEVEL_STYLE[a.score] ?? "bg-muted")}`}
                          >
                            Q{questionNumber.get(a.questionId) ?? "?"}
                          </span>
                        ))}
                      </span>
                      <span className="ml-auto text-sm text-muted-foreground">
                        completed <LocalDateTime iso={r.submittedAt!.toISOString()} />
                      </span>
                    </summary>
                    <div className="mt-3 flex flex-col gap-2">
                      {r.answers.map((a) => (
                        <div key={a.questionId} className="rounded-md bg-muted/50 p-3 text-sm">
                          <p className="text-muted-foreground">{questionText.get(a.questionId) ?? "Question"}</p>
                          <p className="mt-1 whitespace-pre-wrap">“{a.answer}”</p>
                          <p className="mt-2 flex flex-wrap items-center gap-2">
                            {a.score !== null && (
                              <span className={`rounded px-1.5 py-0.5 text-xs ${LEVEL_STYLE[a.score] ?? "bg-muted"}`}>
                                {LEVEL_LABEL[a.score] ?? a.score}
                              </span>
                            )}
                            <span>{a.rationale}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
