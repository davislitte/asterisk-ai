import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/server/auth";
import { listClasses } from "@/server/classes";
import { dailyCapUsd, spentTodayUsd } from "@/server/spend";
import { NewClassForm } from "./new-class-form";

export default async function ClassesPage() {
  const teacher = await requireTeacher();
  const [classList, spent] = await Promise.all([listClasses(teacher.id), spentTodayUsd()]);
  const cap = dailyCapUsd();
  const usedPct = cap > 0 ? Math.min(100, (100 * spent) / cap) : 100;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your classes</h1>
          <p className="text-muted-foreground">
            Students join a class with its code, then see the assignments you publish there.
          </p>
        </div>
        <div className="flex min-w-48 flex-col gap-1 text-sm" title="Resets daily at midnight UTC. Set DAILY_SPEND_CAP_USD to change.">
          <span className="text-muted-foreground">
            AI usage today: <span className="font-medium text-foreground tabular-nums">${spent.toFixed(2)}</span> of $
            {cap.toFixed(2)} cap
          </span>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="AI spending today"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedPct)}
          >
            <div className={usedPct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${usedPct}%` }} />
          </div>
          {usedPct >= 100 && <span className="text-destructive">Cap reached: Asterisk is paused until tomorrow.</span>}
        </div>
      </div>

      <NewClassForm />

      {classList.length === 0 ? (
        <p className="text-muted-foreground">No classes yet. Create one above to get a join code.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {classList.map((c) => (
            <li key={c.id}>
              <Link href={`/classes/${c.id}`} className="block rounded-xl focus-visible:outline-2">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      Join code <span className="font-mono font-semibold text-foreground">{c.joinCode}</span>
                      {" · "}
                      {c.assignmentCount} {c.assignmentCount === 1 ? "assignment" : "assignments"}
                      {" · "}
                      {c.studentCount} {c.studentCount === 1 ? "student" : "students"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
