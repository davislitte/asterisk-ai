# Demo kit

Everything needed to run the 3-minute Asterisk demo, on camera or on your own machine.

| File | What it's for |
|---|---|
| [`Unit 4 Notes.pdf`](Unit%204%20Notes.pdf) | The class notes the teacher uploads. One section per page, so the tutor cites "Unit 4 Notes · p. 2". Same text as the seeded notes. |
| [`rubric.txt`](rubric.txt) | The rubric the teacher pastes into **Rubric → Import**. |
| [`student-draft.txt`](student-draft.txt) | The student's work, to paste into a real Google Doc. It misses the second root on problem 2, divides by x on problem 3 and never rejects -8 on problem 5. |
| [`worksheet-photo.jpg`](worksheet-photo.jpg) | A stand-in for a phone photo of handwritten work (problems 1, 2 and 4; problem 2 misses a root). A real photo of real handwriting looks better on video; see [the photo](#the-handwritten-photo). |

All of it is original and made for this project.

The demo uses the seeded class **Algebra I — Period 3** (join code `QUAD24`). Its seeded assignment, "Solving Quadratics by Factoring", already has 22 made-up classmates' work and a class report. On camera the teacher builds the *next* assignment, "Factoring Quadratics: Day 2", and a student works through it.

## Before recording

1. `pnpm dev`, and sign in to http://localhost:3000.
2. `pnpm demo:reset` to see what earlier takes left behind, then `pnpm demo:reset --apply` to remove it. It only touches the demo class and never removes the seeded assignment, its report or the seeded students.
3. Build the extension (`pnpm --filter @asterisk/extension build`) and load `apps/extension/dist` unpacked in Chrome. If the panel is still signed in from an earlier take, click **Leave class**.
4. In a Google account, create a Doc named **Factoring Day 2** and paste in `student-draft.txt`.
5. Have the handwritten photo on the computer (or phone, if you'll upload from there).
6. Close other tabs, zoom the dashboard to about 110%, and widen the side panel a little.

## Run sheet

Measured on Muse Spark during rehearsal on Oct 30. Cut the waits in editing.

### 0:00–0:20 · The problem

Schools are banning AI because students use it to skip the learning. Students will need AI the way they need a calculator. Asterisk puts it back in the classroom on the teacher's terms.

### 0:20–0:50 · The teacher sets up Day 2

1. **Algebra I — Period 3 → New assignment.**
   - Title `Factoring Quadratics: Day 2`, subject `Algebra I`, grade `9`.
   - Instructions: `Solve each equation by factoring. Show every step, find ALL solutions, and check them in the original equation. For problem 5, explain which solution makes sense and why.`
2. Problems and answer keys (the keys are never sent to students):

   | # | Problem | Answer key |
   |---|---|---|
   | 1 | `Solve x^2 - 7x + 12 = 0 by factoring.` | `x = 3 or x = 4` |
   | 2 | `Solve x^2 + 3x - 10 = 0 by factoring.` | `x = 2 or x = -5` |
   | 3 | `Solve 4x^2 + 12x = 0 by factoring.` | `x = 0 or x = -3` |
   | 4 | `Solve x^2 - 25 = 0 by factoring.` | `x = 5 or x = -5` |
   | 5 | `A rectangle's length is 2 m more than its width, and its area is 48 m^2. Write a quadratic equation and solve it to find the width.` | `w(w + 2) = 48 → w^2 + 2w - 48 = 0 → (w + 8)(w - 6) = 0 → width = 6 m (reject -8)` |

3. **Help level 2 · Socratic.** "Where Asterisk works" is already `docs.google.com/document/*`; say "Google Docs only". Click **Create assignment**. You land on Sources.
4. **Sources:** upload `Unit 4 Notes.pdf` → **Add source**. About 2 s; it shows 6 sections, one per page.
5. **Rubric:** paste `rubric.txt` → **Import** (about 5 s, 4 criteria, 12 points) → **Save rubric**.
6. **Check questions → Draft 3 questions with Asterisk** (8–10 s). They come back about problems 1–3 and 5, such as why dividing by x on problem 3 is a mistake. Approve all three → **Save questions**.

### 0:50–1:40 · The student in Google Docs

1. Open the Google Doc and the Asterisk side panel. Join with `QUAD24` and the name `Jamie`, then pick **Factoring Quadratics: Day 2**.
2. Switch to any other site for a second: "Asterisk isn't enabled here by your teacher." Then switch back.
3. **Ask:** `I'm stuck on problem 2. I factored it into (x + 5)(x - 2) = 0. What do I do next?` (5–10 s). Expect a guiding question that quotes "Set EACH factor equal to zero", with a **Unit 4 Notes · p. 2** citation. It doesn't give the roots.
4. **Ask:** `just give me the answer to number 4` (about 5 s). It says it can't give the answer, asks what pattern x² − 25 fits, and cites p. 5. This message is flagged for the teacher.
   - Don't open with "I got x = 2, is that it?". Asking Asterisk to confirm an answer is treated as asking for it and gets flagged, which muddles the first beat.
5. **Photo** → choose the worksheet photo (10–12 s). Problems 1 and 4 come back **On track**, and problem 2 **Take another look**: "you only set one factor to zero". It doesn't say what the other root is. Open **What Asterisk read** to show it transcribed the handwriting.

### 1:40–2:15 · Check, then prove understanding

1. **Check my work → Read my Google Doc → Check against the rubric** (about 8 s). The student gets 5/12, practice only. Each criterion has one thing that's working and one next step, such as "use the zero product property on every factor". Point out that it never rewrites the student's work.
2. **Finish:** type an answer to each of the 3 questions, for example:
   - `Because if the product is zero then one of the factors has to be zero. If it equaled 12 the factors could be anything.`
   - `Dividing by x throws away the x = 0 answer. You factor out 4x instead so both factors give a root.`
   - `A width can't be negative so I keep 6 and reject -8.`
3. **Submit answers & mark complete** (about 10 s). Students don't see the grades; the teacher does.

### 2:15–2:45 · What the teacher learns

1. **Day 2 → Monitor:** Jamie's "just give me the answer" is flagged with Asterisk's reply underneath. With **Live** on, the monitor refreshes by itself as students work.
2. Switch to yesterday's assignment, **Solving Quadratics by Factoring → Report** (the stored report; don't rebuild it on camera):
   - **12/25 students stop after the first root.** Each misconception shows quotes from the students' own work, every quote checked word for word.
   - 7/25 divide by x and lose x = 0; 12/25 keep only the positive square root; 4/25 keep a negative width.
   - **Reteach plan:** a 43-minute lesson with new example problems, plus an exit ticket.
   - **How Asterisk built this report:** Muse Spark chose 12 read-only tool calls over 5 turns, then recounted each misconception against every student. It took 29 s and cost $0.17. Students appear to the model only as "Student 01", "Student 02" and so on.

### 2:45–3:00 · Proof and close

- **Answer leaks:** 0 of 136 adversarial attempts, against 7.4% for a typical "don't give answers" tutor prompt and 97.1% for plain Muse Spark. That's the same model, the same messages and the same judge ([eval results](../README.md#eval-results)).
- **Grounding:** no outside knowledge in 40 of 40 answers to questions the notes don't cover, against 80% outside knowledge for the typical tutor prompt.
- **Close:** Asterisk handles the mundane parts of learning faster, so students have time to take risks and build.

District-hosted mode (Muse Spark Open) isn't set up yet, so it isn't in this run.

## The handwritten photo

Write this on lined paper and take the photo in good light. Problem 2 deliberately stops at one root; the checks on 1 and 4 keep those marked on track.

```
Factoring Day 2

1) x² - 7x + 12 = 0
   (x - 3)(x - 4) = 0
   x = 3 or x = 4
   check: 9 - 21 + 12 = 0 ✓   16 - 28 + 12 = 0 ✓

2) x² + 3x - 10 = 0
   (x + 5)(x - 2) = 0
   x - 2 = 0 so x = 2

4) x² - 25 = 0
   (x - 5)(x + 5) = 0
   x = 5 or x = -5
   check: 25 - 25 = 0 ✓   25 - 25 = 0 ✓
```

## After each take

`pnpm demo:reset` lists the Day 2 assignment and the student the take added; `pnpm demo:reset --apply` removes them, including the uploaded PDF. A full take costs about $0.07 in model calls (16 calls).
