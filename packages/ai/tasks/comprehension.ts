import {
  AnswerGrade,
  type GradeAnswerInput,
  GeneratedQuestions,
  type QuestionGenInput,
  gradeAnswerPromptV1,
  questionGenPromptV1,
  understandingScore,
} from "../prompts/comprehension";
import { completeJson } from "../provider/client";

/** T6: draft comprehension questions for the teacher to edit and approve. Nothing is saved here. */
export async function generateCheckQuestions(input: QuestionGenInput): Promise<GeneratedQuestions["questions"]> {
  const result = await completeJson({
    purpose: "questions.generate",
    messages: questionGenPromptV1(input),
    schemaName: "check_questions",
    schema: GeneratedQuestions,
    reasoningEffort: "medium",
  });
  return result.data.questions
    .map((q) => ({ text: q.text.trim(), checks: q.checks.trim() }))
    .filter((q) => q.text)
    .slice(0, input.count);
}

export interface GradedAnswer extends AnswerGrade {
  /** 0 (none) … 3 (strong). */
  score: number;
}

/** S7: grade one typed answer for the teacher's report. Never shown to the student. */
export async function gradeComprehensionAnswer(input: GradeAnswerInput): Promise<GradedAnswer> {
  const result = await completeJson({
    purpose: "comprehension.grade",
    messages: gradeAnswerPromptV1(input),
    schemaName: "answer_grade",
    schema: AnswerGrade,
    reasoningEffort: "low",
  });
  return {
    ...result.data,
    rationale: result.data.rationale.trim(),
    misconception: result.data.misconception.trim(),
    score: understandingScore(result.data.understanding),
  };
}
