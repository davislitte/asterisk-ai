"use server";

import { ClassInput } from "@asterisk/shared";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { classes } from "@/db/schema";
import { requireTeacher } from "@/server/auth";
import { getClassForTeacher } from "@/server/classes";
import { withUniqueJoinCode } from "@/server/join-code";

export interface FormState {
  error?: string;
}

export async function createClass(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = ClassInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid class name" };

  const created = await withUniqueJoinCode((joinCode) =>
    db
      .insert(classes)
      .values({ teacherId: teacher.id, name: parsed.data.name, joinCode })
      .returning({ id: classes.id }),
  );
  revalidatePath("/");
  redirect(`/classes/${created[0]!.id}`);
}

export async function regenerateJoinCode(classId: string): Promise<{ joinCode?: string; error?: string }> {
  const teacher = await requireTeacher();
  const klass = await getClassForTeacher(teacher.id, classId);
  if (!klass) return { error: "Class not found" };

  const [updated] = await withUniqueJoinCode((joinCode) =>
    db
      .update(classes)
      .set({ joinCode })
      .where(and(eq(classes.id, klass.id), eq(classes.teacherId, teacher.id)))
      .returning({ joinCode: classes.joinCode }),
  );
  revalidatePath(`/classes/${klass.id}`);
  revalidatePath("/");
  return { joinCode: updated!.joinCode };
}
