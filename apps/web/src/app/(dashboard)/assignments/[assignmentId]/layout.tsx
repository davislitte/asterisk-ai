import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { AssignmentTabs } from "./tabs";

export default async function AssignmentLayout({
  params,
  children,
}: LayoutProps<"/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/classes/${assignment.classId}`} className="text-sm text-muted-foreground hover:underline">
          ← {assignment.className}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{assignment.title}</h1>
      </div>
      <AssignmentTabs assignmentId={assignment.id} />
      {children}
    </div>
  );
}
