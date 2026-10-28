import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { listCheckQuestions, listComprehensionResponses } from "@/server/check-questions";
import { QuestionsEditor } from "./questions-editor";

const LEVEL_LABEL = ["No understanding", "Partial", "Solid", "Strong"];

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
  const submitted = responses.filter((r) => r.submittedAt);

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
        <CardContent className="flex flex-col gap-4">
          {submitted.length === 0 ? (
            <p className="text-muted-foreground">No submissions yet.</p>
          ) : (
            submitted.map((r) => (
              <div key={r.studentId} className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
                <p className="font-medium">
                  {r.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · completed <LocalDateTime iso={r.submittedAt!.toISOString()} />
                  </span>
                </p>
                {r.answers.map((a) => (
                  <div key={a.questionId} className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="text-muted-foreground">{questionText.get(a.questionId) ?? "Question"}</p>
                    <p className="mt-1 whitespace-pre-wrap">“{a.answer}”</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      {a.score !== null && (
                        <Badge variant={a.score >= 2 ? "secondary" : "destructive"}>{LEVEL_LABEL[a.score] ?? a.score}</Badge>
                      )}
                      <span>{a.rationale}</span>
                    </p>
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
