/**
 * Hard spending stop. The app installs a guard that throws once the day's
 * spend reaches its cap; the client checks it before every real (non-FAKE)
 * model call. `packages/ai` stays database-free: the guard is injected, like
 * the call logger.
 */

export type SpendGuard = (purpose: string) => void | Promise<void>;

export class SpendCapReachedError extends Error {
  constructor(message = "Daily AI spending cap reached") {
    super(message);
    this.name = "SpendCapReachedError";
  }
}

let activeGuard: SpendGuard | null = null;

export function setSpendGuard(guard: SpendGuard | null): void {
  activeGuard = guard;
}

/** Throws SpendCapReachedError (or whatever the guard throws) to block the call. */
export async function checkSpend(purpose: string): Promise<void> {
  if (activeGuard) await activeGuard(purpose);
}
