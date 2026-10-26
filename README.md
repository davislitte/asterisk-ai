# Asterisk AI

**AI back in the classroom, on the teacher's terms.**

Schools are banning AI because students use it to skip the learning. Asterisk gives teachers control instead. The teacher uploads the assignment, the sources and the rubric. Students get an AI side panel that:

- only works on sites the teacher allows,
- only draws on the teacher's sources,
- guides students toward answers without giving them away.

Before submitting, the student gets rubric-based feedback and answers three comprehension questions out loud. The teacher then sees where understanding broke down, for example "14/22 students found only one root of the quadratic."

Built for the Meta Global AI Developer Hackathon (Indie track, *Build for Your World*).

> 🚧 In active development during the hackathon (Oct 26 – Nov 4, 2026). Sections marked _TBD_ are filled in as features land.

## How it works

| For teachers (web dashboard) | For students (Chrome side panel) |
|---|---|
| Create an assignment, upload sources and a rubric | Join a class with a code and a display name |
| Set a help level from 1 (hints only) to 4 (worked parallel example) | Guided chat grounded in the teacher's sources, with citations |
| Allowlist the sites where the panel works | Photo of handwritten work → per-problem feedback |
| Approve 3 end-of-assignment comprehension questions | Rubric pre-check that never rewrites their work |
| Live monitor of flagged messages; misconception reports | Answer comprehension questions by voice |

## Meta models used

Every runtime AI call goes to a Meta model, through one provider module (`packages/ai`).

| Feature | Model | Status |
|---|---|---|
| Guided tutoring, rubric feedback, question generation, grading | Muse Spark (`muse-spark-1.3`, Meta Model API) | Provider + smoke test written; not yet run (awaiting API credits) |
| Import a pasted/uploaded rubric into structured criteria | Muse Spark (structured output) | Built; tested only against the `FAKE` stub so far |
| District-hosted mode | Muse Spark Open via Baseten / Modal | Config switch stubbed |
| Photo of handwritten work → feedback | Muse Spark (vision) | _TBD_ |
| Split a worksheet photo into problems | SAM 3.1 | _TBD_ |
| Spoken comprehension check | Muse Voice Transcribe → Muse Spark | _TBD_ |
| Class misconception report + reteach plan | Muse Spark, multi-step tool-calling agent | _TBD_ |
| Off-topic / jailbreak monitor | Muse Spark | _TBD_ |

We use `muse-spark-1.3`, not the cheaper `-contributor` variant, because that variant uses request data for training and our users are minors.

### `FAKE` provider: a dev-only test stub, not a model

`AI_PROVIDER=FAKE` swaps every model call for a canned response built locally ([`packages/ai/provider/fake.ts`](packages/ai/provider/fake.ts)), so the UI can be built and tested without an API key.

- It never makes a network request and never calls any model, Meta or otherwise.
- It logs a `[FAKE MODEL]` warning on every call and is recorded as provider `FAKE` in `model_call_logs`.
- It refuses to run when `NODE_ENV=production`, so it can't be selected in a deployed build.
- Its responses use the same wire format as Muse Spark and go through the same parsing, validation and logging code.

Nothing produced by `FAKE` is shown in the demo or counted in eval results.

## Guardrails

- **Answer keys never reach students.** Teachers can enter an answer key per problem so Asterisk can check its own replies for leaks. Student-facing payloads are built field by field by `toStudentAssignment()` ([`packages/shared/src/student.ts`](packages/shared/src/student.ts)) and validated against a strict schema. Every student route responds through `studentJson()`, which refuses any payload containing an answer key. A test fails the build if a route under `app/api/student/` skips either step.
- **Teacher-supplied URLs** are fetched behind an SSRF guard: public IPs only, re-checked on every redirect, with size and time limits.
- _TBD_ — answer-leak check on every response, grounding to teacher sources, off-topic/jailbreak classification, never rewriting student work.

## Student privacy

- Students are stored by display name only. No emails or accounts.
- Row-level security is enabled on every table, and no policies grant access. Supabase's public REST API therefore can't read student data; only the server-side app connection can.
- **District-hosted mode** runs the same features on Muse Spark Open, served on infrastructure the school or district controls. Student data never leaves it.

## Repo layout

```
apps/web          Next.js teacher dashboard + API routes (Tailwind, shadcn/ui, Drizzle)
apps/extension    Chrome MV3 side panel for students (Vite + CRXJS + React)
packages/ai       Meta model provider switch, prompts, guardrails, call logging
packages/shared   Types and zod schemas shared by web and extension
```

## Setup

Requirements: Node 24+, pnpm, a Supabase project, and a [Meta Model API](https://dev.meta.ai) key.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env.local` at the repo root and fill in `MODEL_API_KEY`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `TEACHER_PASSCODE` and `SESSION_SECRET` (plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to keep original uploads). In Supabase, find both connection strings under **Connect**: use the transaction pooler for `DATABASE_URL` and the session pooler for migrations.

3. Create the tables and the demo class (join code `QUAD24`):

   ```bash
   pnpm db:migrate
   ```

   ```bash
   pnpm db:seed
   ```

4. Check that Muse Spark answers:

   ```bash
   pnpm ai:smoke
   ```

5. Run the teacher dashboard at http://localhost:3000 and sign in with `TEACHER_PASSCODE`:

   ```bash
   pnpm dev
   ```

   Run the tests with:

   ```bash
   pnpm test
   ```

6. Build the extension, then load `apps/extension/dist` as an unpacked extension in `chrome://extensions`:

   ```bash
   pnpm --filter @asterisk/extension build
   ```

   Click the Asterisk toolbar icon to open the side panel, then join with a class code (the seed's is `QUAD24`). The panel only helps on pages that match the assignment's allowlist (by default, Google Docs).

   To work on the panel UI without reloading the extension, run `pnpm dev:extension` and open http://localhost:5173/src/sidepanel/index.html. This **dev preview** stores the session in `localStorage`, proxies `/api` to the dashboard, and shows a bar where you type a simulated tab URL to test allowlist gating.

## Eval results

_TBD_ — `pnpm eval` runs ~30 adversarial student prompts against each help level and reports the answer-leak rate.

## Built during the hackathon

All code in this repo is new and was written for this hackathon. No code comes from earlier projects. The commit history is the build log.

## License

[MIT](LICENSE)
