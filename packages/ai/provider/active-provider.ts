import type { AiProvider } from "./config";

/**
 * Lets the app choose where model calls go at runtime (e.g. the teacher's
 * "district-hosted" switch), without threading a provider through every task.
 * Installed like the spend guard. Returning undefined falls back to AI_PROVIDER;
 * a `provider` set on a single request still wins.
 */

export type ProviderResolver = () => AiProvider | undefined | Promise<AiProvider | undefined>;

let activeResolver: ProviderResolver | null = null;

export function setProviderResolver(resolver: ProviderResolver | null): void {
  activeResolver = resolver;
}

export async function activeProvider(): Promise<AiProvider | undefined> {
  return activeResolver ? await activeResolver() : undefined;
}
