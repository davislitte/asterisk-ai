import {
  ChatRequest,
  type ChatHistoryResponse,
  type ChatReplyResponse,
  type Citation,
  type StudentAssignment,
  type StudentChatMessage,
} from "@asterisk/shared";
import { db } from "@/db/client";
import { chatMessages } from "@/db/schema";
import { type TutorSource, guardedTutorReply } from "@/server/ai";
import { getAnswerKeysForLeakCheck } from "@/server/student/answer-keys";
import { studentJson } from "@/server/student-response";
import {
  chunksByIds,
  getStudentAssignment,
  listChatHistory,
  listGroundingChunks,
} from "@/server/student/data";
import { chatLimitMessage } from "@/server/student/rate-limit-db";
import { BUSY_MESSAGE, inFlight } from "@/server/student/rate-limits";
import {
  type Student,
  aiUnavailable,
  badRequest,
  getStudent,
  notFound,
  tooManyRequests,
  unauthorized,
} from "@/server/student/session";

const PROMPT_HISTORY_TURNS = 20;

type HistoryRow = Awaited<ReturnType<typeof listChatHistory>>[number];

async function toMessages(rows: HistoryRow[]): Promise<StudentChatMessage[]> {
  const cited = await chunksByIds([...new Set(rows.flatMap((r) => r.citedChunkIds))]);
  const byId = new Map<string, Citation>(cited.map((c) => [c.chunkId, c]));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    citations: r.citedChunkIds.flatMap((id) => byId.get(id) ?? []),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** The student's own conversation for this assignment. */
export async function GET(request: Request, ctx: RouteContext<"/api/student/assignments/[assignmentId]/chat">) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const { assignmentId } = await ctx.params;
  const assignment = await getStudentAssignment(student.classId, assignmentId);
  if (!assignment) return notFound();

  const body: ChatHistoryResponse = {
    messages: await toMessages(await listChatHistory(student.id, assignment.id)),
  };
  return studentJson(body);
}

/**
 * S3: one guided, source-grounded tutor turn at the teacher's help level,
 * through the guardrail pipeline (classify + answer-leak check, §6).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/student/assignments/[assignmentId]/chat">) {
  const receivedAt = new Date();
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const { assignmentId } = await ctx.params;
  const assignment = await getStudentAssignment(student.classId, assignmentId);
  if (!assignment) return notFound();

  const parsed = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid message");

  // Cost protection: per-student limits, then one turn at a time (the daily cap backs both).
  const limited = await chatLimitMessage(student.id);
  if (limited) return tooManyRequests(limited);
  const key = `chat:${student.id}`;
  if (!inFlight.acquire(key)) return tooManyRequests(BUSY_MESSAGE);
  try {
    return await chatTurn(student, assignment, parsed.data, receivedAt);
  } finally {
    inFlight.release(key);
  }
}

async function chatTurn(student: Student, assignment: StudentAssignment, input: ChatRequest, receivedAt: Date) {
  const [chunks, history] = await Promise.all([
    listGroundingChunks(assignment.id),
    listChatHistory(student.id, assignment.id, PROMPT_HISTORY_TURNS),
  ]);
  const sources: TutorSource[] = chunks.map((c, i) => ({
    label: `S${i + 1}`,
    sourceTitle: c.sourceTitle,
    ref: c.ref,
    text: c.text,
  }));
  const chunkIdByLabel = new Map(sources.map((s, i) => [s.label, chunks[i]!.id]));

  let reply;
  try {
    // `assignment` is the student view, so the tutor never receives answer keys.
    // Answer keys go only to the server-side leak check, and nothing from it is
    // returned to the student except the final, checked reply.
    reply = await guardedTutorReply({
      assignment,
      sources,
      history: history.map((h) => ({ role: h.role, content: h.content })),
      message: input.message,
      // S4: the student's draft, sent only when they chose to share it. Used as
      // context for this turn; not stored with the chat.
      draft: input.draft,
      answerKeys: await getAnswerKeysForLeakCheck(student.classId, assignment.id),
    });
  } catch (err) {
    return aiUnavailable(err, "chat");
  }

  const citedChunkIds = reply.citations.flatMap((label) => chunkIdByLabel.get(label) ?? []);
  const rows = await db
    .insert(chatMessages)
    .values([
      {
        studentId: student.id,
        assignmentId: assignment.id,
        role: "student",
        content: input.message,
        flags: reply.flags,
        createdAt: receivedAt,
      },
      {
        studentId: student.id,
        assignmentId: assignment.id,
        role: "assistant",
        content: reply.reply,
        citedChunkIds,
        guard: reply.guard,
        createdAt: new Date(),
      },
    ])
    .returning({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      citedChunkIds: chatMessages.citedChunkIds,
      createdAt: chatMessages.createdAt,
    });

  const [studentMessage, assistantMessage] = await toMessages(rows);
  const body: ChatReplyResponse = { studentMessage: studentMessage!, reply: assistantMessage! };
  return studentJson(body);
}
