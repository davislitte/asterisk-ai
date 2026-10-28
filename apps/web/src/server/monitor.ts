import "server-only";
import type { MessageFlag } from "@asterisk/shared";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, students } from "@/db/schema";

/** T7 live monitor. Call only after an ownership check (getAssignmentForTeacher). */

const RECENT_MESSAGES = 1000;

export interface MonitorEvent {
  id: string;
  studentName: string;
  message: string;
  flags: MessageFlag[];
  createdAt: Date;
  reply: string | null;
  leakBlocked: boolean;
}

export interface StudentActivity {
  studentId: string;
  name: string;
  messages: number;
  offTopic: number;
  answerSeeking: number;
  jailbreak: number;
  leaksBlocked: number;
}

export async function getMonitorData(assignmentId: string, classId: string) {
  const [rows, roster] = await Promise.all([
    db
      .select({
        id: chatMessages.id,
        studentId: chatMessages.studentId,
        role: chatMessages.role,
        content: chatMessages.content,
        flags: chatMessages.flags,
        guard: chatMessages.guard,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.assignmentId, assignmentId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(RECENT_MESSAGES),
    db
      .select({ id: students.id, name: students.displayName })
      .from(students)
      .where(eq(students.classId, classId))
      .orderBy(asc(students.displayName)),
  ]);

  const names = new Map(roster.map((s) => [s.id, s.name]));
  const activity = new Map<string, StudentActivity>(
    roster.map((s) => [
      s.id,
      { studentId: s.id, name: s.name, messages: 0, offTopic: 0, answerSeeking: 0, jailbreak: 0, leaksBlocked: 0 },
    ]),
  );

  // Walk oldest → newest so each student message pairs with the reply that followed it.
  const chronological = [...rows].reverse();
  const pendingByStudent = new Map<string, MonitorEvent>();
  const events: MonitorEvent[] = [];

  for (const row of chronological) {
    const stats = activity.get(row.studentId);
    if (row.role === "student") {
      if (stats) {
        stats.messages++;
        if (row.flags.includes("off_topic")) stats.offTopic++;
        if (row.flags.includes("answer_seeking")) stats.answerSeeking++;
        if (row.flags.includes("jailbreak")) stats.jailbreak++;
      }
      const event: MonitorEvent = {
        id: row.id,
        studentName: names.get(row.studentId) ?? "Unknown student",
        message: row.content,
        flags: row.flags,
        createdAt: row.createdAt,
        reply: null,
        leakBlocked: false,
      };
      pendingByStudent.set(row.studentId, event);
      events.push(event);
    } else {
      const event = pendingByStudent.get(row.studentId);
      if (event && !event.reply) {
        event.reply = row.content;
        event.leakBlocked = row.guard?.leakDetected ?? false;
        if (event.leakBlocked && stats) stats.leaksBlocked++;
      }
    }
  }

  const feed = events.filter((e) => e.flags.length > 0 || e.leakBlocked).reverse();
  const students_ = [...activity.values()].sort(
    (a, b) =>
      b.offTopic + b.answerSeeking + b.jailbreak + b.leaksBlocked - (a.offTopic + a.answerSeeking + a.jailbreak + a.leaksBlocked) ||
      b.messages - a.messages,
  );

  return {
    feed,
    students: students_,
    totals: {
      messages: events.length,
      flagged: events.filter((e) => e.flags.length > 0).length,
      leaksBlocked: events.filter((e) => e.leakBlocked).length,
    },
    truncated: rows.length === RECENT_MESSAGES,
  };
}
