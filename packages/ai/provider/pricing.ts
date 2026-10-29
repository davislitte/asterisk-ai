/**
 * List price for muse-spark-1.3, USD per million tokens (dev.meta.ai/models/muse-spark).
 * Output includes reasoning tokens. Used for spend estimates and the daily cap;
 * self-hosted providers are priced the same as a conservative stand-in.
 */
export const USD_PER_M_TOKENS_IN = 1.25;
export const USD_PER_M_TOKENS_OUT = 4.25;

export function estimateUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * USD_PER_M_TOKENS_IN + tokensOut * USD_PER_M_TOKENS_OUT) / 1e6;
}
