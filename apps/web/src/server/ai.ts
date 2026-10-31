import { setModelCallLogger, setProviderResolver, setSpendGuard } from "@asterisk/ai";
import { db } from "@/db/client";
import { modelCallLogs } from "@/db/schema";
import { resolveAiProvider } from "./ai-host";
import { enforceDailyCap, recordSpend } from "./spend";

// Server code imports model calls from here, so every call is persisted to
// ModelCallLog, checked against the daily spending cap first, and sent to the
// host the teacher chose (Muse Spark, or district-hosted Muse Spark Open).
setModelCallLogger(async (entry) => {
  if (entry.provider !== "FAKE") recordSpend(entry.tokensIn, entry.tokensOut);
  await db.insert(modelCallLogs).values(entry);
});
setSpendGuard(enforceDailyCap);
setProviderResolver(resolveAiProvider);

export * from "@asterisk/ai";
