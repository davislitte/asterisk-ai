import { notFound } from "next/navigation";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { getRubricCriteria } from "@/server/rubrics";
import { RubricEditor } from "./rubric-editor";

export default async function RubricPage({ params }: PageProps<"/assignments/[assignmentId]/rubric">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();
  const criteria = await getRubricCriteria(assignment.id);

  return <RubricEditor assignmentId={assignment.id} initial={criteria} />;
}
