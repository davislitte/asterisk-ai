import { ImportedRubric, rubricImportPromptV1 } from "../prompts/rubric-import";
import { completeJson } from "../provider/client";

/**
 * T3: turn a pasted or uploaded rubric into editable criteria. The teacher
 * reviews the result before it's saved; nothing here writes to the database.
 */
export async function importRubric(rubricText: string): Promise<ImportedRubric> {
  const result = await completeJson({
    purpose: "rubric.import",
    messages: rubricImportPromptV1(rubricText),
    schemaName: "rubric",
    schema: ImportedRubric,
    reasoningEffort: "low",
  });
  return result.data;
}
