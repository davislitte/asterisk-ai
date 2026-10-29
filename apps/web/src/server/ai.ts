import { setModelCallLogger, setSpendGuard } from "@asterisk/ai";
import { db } from "@/db/client";
import { modelCallLogs } from "@/db/schema";
import { enforceDailyCap, recordSpend } from "./spend";

// Server code imports model calls from here, so every call is persisted to
// ModelCallLog and checked against the daily spending cap first.
setModelCallLogger(async (entry) => {
  if (entry.provider !== "FAKE") recordSpend(entry.tokensIn, entry.tokensOut);
  await db.insert(modelCallLogs).values(entry);
});
setSpendGuard(enforceDailyCap);

export * from "@asterisk/ai";
