export { AiProvider, type ProviderConfig, resolveProviderConfig } from "./provider/config";
export {
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type ContentPart,
  type ReasoningEffort,
  complete,
  completeJson,
} from "./provider/client";
export { ModelCallError, SPEND_CAP_MESSAGE, STUDENT_SAFE_ERROR_MESSAGE } from "./provider/errors";
export { USD_PER_M_TOKENS_IN, USD_PER_M_TOKENS_OUT, estimateUsd } from "./provider/pricing";
export { type SpendGuard, SpendCapReachedError, setSpendGuard } from "./provider/spend-guard";
export { ImportedRubric, RUBRIC_IMPORT_MAX_CHARS } from "./prompts/rubric-import";
export { importRubric } from "./tasks/import-rubric";
export { TUTOR_PROMPT_VERSION, type TutorContext, type TutorSource, type TutorTurn } from "./prompts/tutor";
export { tutorReply } from "./tasks/tutor-reply";
export {
  type GuardOutcome,
  type GuardedTutorInput,
  type GuardedTutorResult,
  LEAK_FALLBACK_REPLY,
  checkLeak,
  classifyMessage,
  guardedTutorReply,
} from "./tasks/guarded-tutor";
export type { RubricCheckCriterion, RubricCheckInput } from "./prompts/rubric-check";
export { type RubricCheckCriterionResult, type RubricCheckResultData, rubricCheck } from "./tasks/rubric-check";
export { UNDERSTANDING_LEVELS } from "./prompts/comprehension";
export { type GradedAnswer, generateCheckQuestions, gradeComprehensionAnswer } from "./tasks/comprehension";
export {
  type ModelCallLogEntry,
  type ModelCallLogger,
  consoleModelCallLogger,
  setModelCallLogger,
} from "./provider/logging";
