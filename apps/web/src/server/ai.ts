import { setModelCallLogger } from "@asterisk/ai";
import { db } from "@/db/client";
import { modelCallLogs } from "@/db/schema";

// Server code imports model calls from here, so every call is persisted to ModelCallLog.
setModelCallLogger(async (entry) => {
  await db.insert(modelCallLogs).values(entry);
});

export * from "@asterisk/ai";
