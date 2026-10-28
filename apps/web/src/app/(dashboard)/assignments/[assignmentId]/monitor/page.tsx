import type { MessageFlag } from "@asterisk/shared";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { getMonitorData } from "@/server/monitor";
import { AutoRefresh } from "./auto-refresh";

const FLAG_LABEL: Record<MessageFlag, string> = {
  answer_seeking: "Asked for the answer",
  jailbreak: "Tried to bypass rules",
  off_topic: "Off-topic",
};

export default async function MonitorPage({ params }: PageProps<"/assignments/[assignmentId]/monitor">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();
  const { feed, students, totals, truncated } = await getMonitorData(assignment.id, assignment.classId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Messages Asterisk flagged, and replies it stopped from giving an answer away.
        </p>
        <AutoRefresh renderedAt={new Date().toISOString()} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Student messages" value={totals.messages} />
        <Stat label="Flagged" value={totals.flagged} />
        <Stat label="Answer leaks blocked" value={totals.leaksBlocked} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By student</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {students.length === 0 ? (
            <p className="text-muted-foreground">No students have joined this class yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Student</th>
                  <th className="py-2 pr-4 text-right font-medium">Messages</th>
                  <th className="py-2 pr-4 text-right font-medium">Asked for answer</th>
                  <th className="py-2 pr-4 text-right font-medium">Bypass attempts</th>
                  <th className="py-2 pr-4 text-right font-medium">Off-topic</th>
                  <th className="py-2 text-right font-medium">Leaks blocked</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId} className="border-t">
                    <td className="py-2 pr-4 font-medium">{s.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{s.messages}</td>
                    <Count n={s.answerSeeking} />
                    <Count n={s.jailbreak} />
                    <Count n={s.offTopic} />
                    <Count n={s.leaksBlocked} last />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Feed</h2>
        {feed.length === 0 ? (
          <p className="text-muted-foreground">Nothing flagged yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {feed.map((e) => (
              <li key={e.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {e.studentName}
                      {e.flags.map((f) => (
                        <Badge key={f} variant={f === "jailbreak" ? "destructive" : "secondary"}>
                          {FLAG_LABEL[f]}
                        </Badge>
                      ))}
                      {e.leakBlocked && <Badge variant="outline">Answer leak blocked</Badge>}
                    </CardTitle>
                    <CardDescription>
                      <LocalDateTime iso={e.createdAt.toISOString()} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <p className="whitespace-pre-wrap">“{e.message}”</p>
                    {e.reply && (
                      <details>
                        <summary className="cursor-pointer text-sm text-muted-foreground">Asterisk&apos;s reply</summary>
                        <p className="mt-2 rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{e.reply}</p>
                      </details>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {truncated && <p className="text-sm text-muted-foreground">Showing the most recent 1,000 messages.</p>}
      </section>
    </div>
  );
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

function Count({ n, last }: { n: number; last?: boolean }) {
  return (
    <td className={`py-2 text-right tabular-nums ${last ? "" : "pr-4"} ${n > 0 ? "font-semibold" : "text-muted-foreground"}`}>
      {n}
    </td>
  );
}
