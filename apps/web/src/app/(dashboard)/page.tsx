import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/server/auth";
import { listClasses } from "@/server/classes";
import { NewClassForm } from "./new-class-form";

export default async function ClassesPage() {
  const teacher = await requireTeacher();
  const classList = await listClasses(teacher.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your classes</h1>
        <p className="text-muted-foreground">
          Students join a class with its code, then see the assignments you publish there.
        </p>
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
