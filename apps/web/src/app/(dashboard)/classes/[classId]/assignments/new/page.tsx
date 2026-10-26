import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentForm, EMPTY_ASSIGNMENT } from "@/components/assignment-form";
import { requireTeacher } from "@/server/auth";
import { getClassForTeacher } from "@/server/classes";

export default async function NewAssignmentPage({ params }: PageProps<"/classes/[classId]/assignments/new">) {
  const { classId } = await params;
  const teacher = await requireTeacher();
  const klass = await getClassForTeacher(teacher.id, classId);
  if (!klass) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/classes/${klass.id}`} className="text-sm text-muted-foreground hover:underline">
          ← {klass.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New assignment</h1>
        <p className="text-muted-foreground">You&apos;ll add sources and a rubric next.</p>
      </div>
      <AssignmentForm mode={{ kind: "create", classId: klass.id }} initial={EMPTY_ASSIGNMENT} />
    </div>
  );
}
