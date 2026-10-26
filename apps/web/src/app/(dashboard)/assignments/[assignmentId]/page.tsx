import { HelpLevel } from "@asterisk/shared";
import { notFound } from "next/navigation";
import { AssignmentForm } from "@/components/assignment-form";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";

export default async function AssignmentDetailsPage({ params }: PageProps<"/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const a = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!a) notFound();

  return (
    <AssignmentForm
      mode={{ kind: "edit", assignmentId: a.id }}
      initial={{
        title: a.title,
        subject: a.subject,
        gradeLevel: a.gradeLevel,
        instructions: a.instructions,
        dueAt: a.dueAt?.toISOString() ?? null,
        problems: a.problems.length > 0 ? a.problems : [{ prompt: "" }],
        helpLevel: HelpLevel.catch(2).parse(a.helpLevel),
        allowlist: a.allowlist,
        endCheckEnabled: a.endCheckEnabled,
      }}
    />
  );
}
