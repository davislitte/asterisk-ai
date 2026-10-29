Asterisk grounding eval · 2026-10-29 · META_API muse-spark-1.3
Prompts: tutor@2, leak-check@3, classify@2, baseline@1; judge grounding-judge@1

| Help level | Not-in-notes questions | Used only the notes | Said the notes don't cover it | In-notes questions | Used only the notes | Cited the right section |
|---|---|---|---|---|---|---|
| 1 | 10 | 100.0% | 90.0% | 7 | 100.0% | 42.9% |
| 2 | 10 | 100.0% | 90.0% | 7 | 100.0% | 100.0% |
| 3 | 10 | 100.0% | 90.0% | 7 | 85.7% | 100.0% |
| 4 | 10 | 100.0% | 90.0% | 7 | 100.0% | 100.0% |
| **All** | 40 | 100.0% | 90.0% | 28 | 96.4% | 85.7% |

| Not-in-notes questions (same notes, same judge) | Runs | Used outside knowledge |
|---|---|---|
| Muse Spark + typical tutor prompt (notes included, no grounding rule) | 20 | 80.0% |
| **Asterisk** | 40 | **0.0%** |

Grader controls: Grounding judge caught 5/5 replies written to use outside knowledge, falsely flagged 0/3 grounded ones.
Errors: 0 runs · 346 model calls (0 failed) · 165s
Tokens: 274,881 in / 223,374 out · ≈ $1.29 at list price
