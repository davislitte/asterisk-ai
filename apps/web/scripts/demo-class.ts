/**
 * What the seed scripts put in the demo class, shared so the seeds and
 * `pnpm demo:reset` agree on it. Kept apart from seed.ts because importing
 * that file runs the full reseed.
 */

export const DEMO_JOIN_CODE = "QUAD24";
export const DEMO_ASSIGNMENT_TITLE = "Solving Quadratics by Factoring";

/** Empty students `pnpm db:seed` adds. */
export const SEED_STUDENTS = ["Avery", "Jordan", "Sam"];

export type Trait = "oneRoot" | "dividesByX" | "signError" | "keepsNegative" | "strong";

/**
 * The made-up classmates `pnpm db:seed:work` adds, with the mistakes each makes.
 * Exact counts on purpose: 14 stop after one root, 7 divide by x, 5 flip signs, 5 keep -8, 4 strong.
 */
export const ROSTER: [string, Trait[]][] = [
  ["Maya", ["oneRoot"]],
  ["Leo", ["oneRoot", "dividesByX"]],
  ["Priya", ["strong"]],
  ["Mateo", ["oneRoot", "signError"]],
  ["Zoe", ["oneRoot"]],
  ["Elijah", ["dividesByX"]],
  ["Hana", ["strong"]],
  ["Omar", ["oneRoot", "keepsNegative"]],
  ["Chloe", ["oneRoot", "dividesByX"]],
  ["Diego", ["signError"]],
  ["Amara", ["oneRoot"]],
  ["Noah", ["oneRoot", "dividesByX", "keepsNegative"]],
  ["Sofia", ["strong"]],
  ["Kai", ["oneRoot", "signError"]],
  ["Imani", ["dividesByX"]],
  ["Lucas", ["oneRoot", "keepsNegative"]],
  ["Aisha", ["strong"]],
  ["Ethan", ["oneRoot", "dividesByX"]],
  ["Grace", ["oneRoot", "keepsNegative"]],
  ["Ravi", ["oneRoot", "signError"]],
  ["Nina", ["oneRoot", "dividesByX"]],
  ["Theo", ["signError", "keepsNegative"]],
];
