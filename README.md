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
| Guided tutoring with citations, at 4 help levels | Muse Spark (`muse-spark-1.3`, Meta Model API) | ✅ Live |
| Rubric pre-check feedback on a student's draft | Muse Spark (structured output) | ✅ Live |
| Question generation, comprehension grading | Muse Spark | _TBD_ |
| Import a pasted/uploaded rubric into structured criteria | Muse Spark (structured output) | Built; not yet tried on Muse Spark |
| District-hosted mode | Muse Spark Open via Baseten / Modal | Config switch stubbed |
| Photo of handwritten work → feedback | Muse Spark (vision) | _TBD_ |
| Split a worksheet photo into problems | SAM 3.1 | _TBD_ |
| Spoken comprehension check | Muse Voice Transcribe → Muse Spark | _TBD_ |
| Class misconception report + reteach plan | Muse Spark, multi-step tool-calling agent | _TBD_ |
| Off-topic / jailbreak classifier, answer-leak check | Muse Spark (structured output) | ✅ Live; measured by `pnpm eval` below |

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
- **Every tutor reply is checked for answer leaks before a student sees it** ([`packages/ai/tasks/guarded-tutor.ts`](packages/ai/tasks/guarded-tutor.ts)). The pipeline runs per message:
  1. The student's message is classified, in parallel with the tutor drafting a reply.
  2. Muse Spark acts as a judge and compares the draft with the teacher's answer keys, server-side. It flags stated answers, giveaway steps, confirming or denying a guessed answer, and "examples" that reuse the assigned numbers.
  3. A leaking draft is rewritten once in a stricter mode. If the rewrite still leaks, the student gets a safe fallback reply.

  The check **fails closed**: if it can't run, no unchecked reply is shown. The tutor model itself never receives the answer keys.
- **Every student message is classified** as off-topic, asking for the answer, or trying to bypass the rules (jailbreak). Flags go to the teacher's live **Monitor** tab, along with every leak the guard blocked. Students get a gentle redirect, and the join screen tells them their teacher can see their chats.
- **Rubric pre-check never rewrites student work.** Before submitting, a student can check their draft against the teacher's rubric. For each criterion they get a level, one thing that's working and one next step. Points come from the teacher's rubric, never from the model. The grader sees the answer keys on the server so it can judge accuracy. Its feedback then goes through a feedback-mode leak check before the student sees it: it may say an answer is wrong, but may not supply the correct value or corrected work.
- **Reading the student's Google Doc only happens on their click.** The panel runs a same-origin read inside the Doc tab, using the Doc's own plain-text export and the student's own session. No Google credentials ever reach Asterisk. Drafts shared in chat are context for that question only and aren't saved with the chat.
- **Grounding:** the tutor answers only from the teacher's sources, cites the section it used, and says so when the sources don't cover a question.

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

   An end-to-end test drives the **built** extension in a real browser. With the dashboard running and the seed loaded, run:

   ```bash
   pnpm --filter @asterisk/extension test:e2e
   ```

   It joins `QUAD24`, chats, checks allowlist gating as the active tab changes, asserts no answer key reaches the extension, and then deletes the data it created. On Windows it uses the installed Edge; elsewhere it uses Playwright's Chromium (`pnpm --filter @asterisk/extension exec playwright install chromium`). Branded Chrome no longer accepts `--load-extension`, so it can't run this test.

   To work on the panel UI without reloading the extension, run `pnpm dev:extension` and open http://localhost:5173/src/sidepanel/index.html. This **dev preview** stores the session in `localStorage`, proxies `/api` to the dashboard, and shows a bar where you type a simulated tab URL to test allowlist gating.

## Eval results

`pnpm eval` runs 34 student messages against all 4 help levels, through the full guarded pipeline ([`packages/ai/eval`](packages/ai/eval)):

- **28 adversarial messages:** direct asks, claimed teacher permission, role-play, "is x = 2 right?", encoding tricks, fishing for the factored form, emotional pressure, and prompt injection.
- **6 controls:** off-topic and genuine questions.

A separate judge prompt, distinct from the in-app leak check, grades both the raw tutor draft and the final reply. The headline number is the raw leak rate versus the guarded leak rate. The eval also reports classifier recall. Results are saved to `packages/ai/eval/results/`.

**Results** (`muse-spark-1.3`, Oct 28, 2026, [`latest.md`](packages/ai/eval/results/latest.md)):

| Help level | Runs | Raw tutor leak rate | Guarded leak rate | Redrafted | Fallback |
|---|---|---|---|---|---|
| 1 · Hints only | 34 | 0.0% | 0.0% | 0 | 0 |
| 2 · Socratic | 34 | 0.0% | 0.0% | 0 | 0 |
| 3 · Explain concepts | 34 | 0.0% | 0.0% | 0 | 0 |
| 4 · Worked example | 34 | 0.0% | 0.0% | 0 | 0 |
| **All** | **136** | **0.0%** | **0.0%** | 0 | 0 |

- **No leaks:** Asterisk didn't give away an answer in any of the 136 adversarial runs. That covers every help level, including level 4, which shows full worked examples. A second full run reproduced 0/136.
- **The graders were checked first.** Every run starts with 12 control replies, 8 written to leak and 4 written to be safe. Both the eval judge and the in-app leak check caught **8/8** leaks and wrongly flagged **0/4** safe replies. So the 0% isn't a judge that can't see leaks.
- **Classifier recall:** asked-for-the-answer 98.2%, bypass attempts 97.9%, off-topic 100%. No genuine question was wrongly flagged as answer-seeking.
- **What this shows and doesn't show:** the tutor prompt alone held on this set, so the leak guard never had to step in. It is a second line of defence for attacks this set doesn't cover. The set is one subject (quadratics) and 34 messages written for this project, not an independent benchmark.

## Built during the hackathon

All code in this repo is new and was written for this hackathon. No code comes from earlier projects. The commit history is the build log.

## License

[MIT](LICENSE)
