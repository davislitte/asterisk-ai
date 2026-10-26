import { HELP_LEVEL_LABELS, HelpLevel } from "@asterisk/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/server/auth";
import { getClassForTeacher, listAssignmentsForClass } from "@/server/classes";
import { JoinCodeCard } from "./join-code-card";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function ClassPage({ params }: PageProps<"/classes/[classId]">) {
  const { classId } = await params;
  const teacher = await requireTeacher();
  const klass = await getClassForTeacher(teacher.id, classId);
  if (!klass) notFound();
  const assignmentList = await listAssignmentsForClass(klass.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← All classes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{klass.name}</h1>
      </div>

      <JoinCodeCard classId={klass.id} joinCode={klass.joinCode} />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assignments</h2>
          <Link href={`/classes/${klass.id}/assignments/new`} className={buttonVariants()}>
            New assignment
          </Link>
        </div>

        {assignmentList.length === 0 ? (
          <p className="text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {assignmentList.map((a) => {
              const level = HelpLevel.safeParse(a.helpLevel);
              return (
                <li key={a.id}>
                  <Link href={`/assignments/${a.id}`} className="block rounded-xl focus-visible:outline-2">
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          {a.title}
                          {level.success && (
                            <Badge variant="secondary">
                              Level {level.data}: {HELP_LEVEL_LABELS[level.data]}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {a.subject}
                          {" · "}
                          {a.sourceCount} {a.sourceCount === 1 ? "source" : "sources"}
                          {a.dueAt && <> · Due {dateFormat.format(a.dueAt)}</>}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
