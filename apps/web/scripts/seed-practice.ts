/**
 * `pnpm db:seed:practice` — adds three practice classes for the demo teacher,
 * one assignment each, to show Asterisk beyond algebra:
 *
 *   SCI007  Life Science · Photosynthesis (help level 3, explain concepts)
 *   ENG008  English · Extended metaphor in an Emily Dickinson poem (help level 1, hints only)
 *   HIS008  U.S./World History · The Industrial Revolution (help level 2, Socratic)
 *
 * Teacher notes, problems, rubrics and questions are original. The poem
 * ("Hope" is the thing with feathers, 1891) is in the public domain. The
 * history "mill worker's day" is written by the teacher and labelled as such;
 * it is not presented as a real primary source.
 *
 * Needs `pnpm db:seed` first (it uses that teacher). Classes that already exist
 * are skipped; pass --replace to delete and recreate them (and their students' work).
 */
import type { AssignedProblem, RubricLevel } from "@asterisk/shared";
import { eq, inArray } from "drizzle-orm";
import { db, sqlClient } from "../src/db/client";
import { assignments, checkQuestions, classes, rubricCriteria, rubrics, sourceChunks, sources } from "../src/db/schema";
import { DEMO_JOIN_CODE } from "./demo-class";


interface Practice {
  joinCode: string;
  className: string;
  title: string;
  subject: string;
  gradeLevel: string;
  helpLevel: 1 | 2 | 3 | 4;
  instructions: string;
  problems: AssignedProblem[];
  sources: { title: string; sections: { ref: string; text: string }[] }[];
  rubric: { name: string; description: string; levels: RubricLevel[] }[];
  questions: string[];
}

const level = (label: string, points: number, description: string): RubricLevel => ({ label, points, description });
const fourLevels = (name: string, description: string, top: string, mid: string, low: string, none: string) => ({
  name,
  description,
  levels: [level("Exemplary", 3, top), level("Proficient", 2, mid), level("Developing", 1, low), level("Beginning", 0, none)],
});

const SCIENCE: Practice = {
  joinCode: "SCI007",
  className: "Life Science — Period 2",
  title: "Photosynthesis: Inputs, Outputs and Light",
  subject: "Life Science",
  gradeLevel: "7",
  helpLevel: 3,
  instructions:
    "Answer each question in complete sentences in your Google Doc. For question 3, use the claim–evidence–reasoning " +
    "(CER) format and cite numbers from the data table.",
  problems: [
    {
      id: "1",
      prompt: "Write the word equation for photosynthesis, including what provides the energy.",
      answerKey: "carbon dioxide + water → (light energy) → glucose + oxygen",
    },
    {
      id: "2",
      prompt: "Where in a plant cell does photosynthesis happen, and which pigment absorbs the light?",
      answerKey: "In the chloroplasts; the green pigment chlorophyll absorbs the light.",
    },
    {
      id: "3",
      prompt:
        "A class counted oxygen bubbles from a water plant (Elodea) with a lamp at different distances: 10 cm → 30 bubbles/min, " +
        "20 cm → 18, 30 cm → 9, 40 cm → 4. Write a CER: how does light distance affect the rate of photosynthesis?",
      answerKey:
        "Claim: the closer the lamp, the faster photosynthesis. Evidence: bubbles fall from 30/min at 10 cm to 4/min at 40 cm. " +
        "Reasoning: closer = more light energy; bubbles are oxygen, a product of photosynthesis, so more bubbles = faster rate.",
    },
    {
      id: "4",
      prompt: "A plant is kept in a dark closet for three days. Predict what happens to its glucose production and explain why.",
      answerKey:
        "Glucose production stops (or nearly stops) because photosynthesis needs light energy; the plant uses up stored glucose.",
    },
  ],
  sources: [
    {
      title: "Unit 3 Notes: Photosynthesis",
      sections: [
        {
          ref: "§1 What plants make",
          text:
            "Plants are producers: they make their own food. Photosynthesis is the process that turns light energy into " +
            "chemical energy stored in sugar (glucose). Almost every food chain on Earth starts with it.",
        },
        {
          ref: "§2 Inputs and outputs",
          text:
            "Every chemical process has inputs (reactants) and outputs (products). For photosynthesis, the plant takes in a gas " +
            "through tiny pores in its leaves and water through its roots. It releases a different gas as a by-product. Ask " +
            "yourself: which gas do animals breathe out, and which do they need? Matter is not created or destroyed, so the " +
            "atoms in the products come from the reactants.",
        },
        {
          ref: "§3 Chloroplasts and chlorophyll",
          text:
            "Plant cells have organelles that animal cells lack. One of them is green because it is packed with a pigment that " +
            "absorbs red and blue light and reflects green light. That is why most leaves look green. Compare a leaf cell with a " +
            "root cell: root cells are underground and have very few of these organelles.",
        },
        {
          ref: "§4 What changes the rate",
          text:
            "The rate of photosynthesis depends on light intensity, carbon dioxide level and temperature. If one input is in short " +
            "supply, the whole process slows down, like a factory missing a part. Scientists often measure the rate by counting " +
            "oxygen bubbles from a water plant or by measuring how fast a leaf disk floats.",
        },
        {
          ref: "§5 Writing a CER",
          text:
            "Claim: one sentence that answers the question. Evidence: specific data, with numbers and units. Reasoning: the " +
            "science idea that connects the evidence to the claim. Example from a different lab: 'Claim: warmer water dissolves " +
            "sugar faster. Evidence: it took 40 s at 60 °C but 150 s at 20 °C. Reasoning: particles move faster when warmer, so " +
            "they collide with the sugar more often.'",
        },
      ],
    },
  ],
  rubric: [
    fourLevels(
      "Scientific accuracy",
      "Inputs, outputs and cell structures are correct.",
      "Every answer is scientifically correct.",
      "Mostly correct, with one small error.",
      "Several errors or mix-ups (e.g. inputs and outputs swapped).",
      "Answers missing or incorrect.",
    ),
    fourLevels(
      "Uses data as evidence",
      "The CER cites specific numbers from the table.",
      "Cites several data points with units and describes the trend.",
      "Cites at least one data point.",
      "Mentions the data without specific numbers.",
      "No data used.",
    ),
    fourLevels(
      "Reasoning",
      "Explains WHY, using the science idea (light energy drives photosynthesis).",
      "Reasoning clearly connects light, oxygen and rate.",
      "Reasoning present but brief.",
      "Restates the claim instead of explaining.",
      "No reasoning.",
    ),
    fourLevels(
      "Vocabulary",
      "Uses terms like reactant, product, chloroplast, chlorophyll and glucose correctly.",
      "Uses key terms correctly throughout.",
      "Uses most key terms correctly.",
      "Few key terms, or some used incorrectly.",
      "No science vocabulary.",
    ),
  ],
  questions: [
    "Why does the number of bubbles tell us how fast photosynthesis is happening?",
    "Matter can't be created or destroyed. Where do the atoms in glucose come from?",
    "Why would a plant in the dark eventually die even if it had plenty of water?",
  ],
};

const DICKINSON = [
  "“Hope” is the thing with feathers -",
  "That perches in the soul -",
  "And sings the tune without the words -",
  "And never stops - at all -",
  "",
  "And sweetest - in the Gale - is heard -",
  "And sore must be the storm -",
  "That could abash the little Bird",
  "That kept so many warm -",
  "",
  "I’ve heard it in the chillest land -",
  "And on the strangest Sea -",
  "Yet - never - in Extremity,",
  "It asked a crumb - of me.",
].join("\n");

const ENGLISH: Practice = {
  joinCode: "ENG008",
  className: "English 8 — Period 4",
  title: "Extended Metaphor: “Hope” is the thing with feathers",
  subject: "English Language Arts",
  gradeLevel: "8",
  helpLevel: 1,
  instructions:
    "Read Emily Dickinson's poem. In your Google Doc, answer questions 1–3 in a sentence or two each, then write one " +
    "analysis paragraph (question 4) with a clear claim, at least two quotations from the poem, and your explanation of each.",
  problems: [
    {
      id: "1",
      prompt: "What is hope compared to in this poem? Name two details the speaker uses to build that comparison.",
      answerKey:
        "A small bird. Details: feathers, perches in the soul, sings a tune without words, never stops, kept so many warm, asked a crumb.",
    },
    {
      id: "2",
      prompt: "In stanza 2, what might the “Gale” and the “storm” stand for?",
      answerKey: "Hard times, trouble or suffering in life; hope sounds sweetest during them and only a very bad storm could silence it.",
    },
    {
      id: "3",
      prompt: "Explain the last two lines: “Yet - never - in Extremity, / It asked a crumb - of me.”",
      answerKey: "Even in the worst conditions, hope never asked anything in return; it gives freely and costs the speaker nothing.",
    },
    {
      id: "4",
      prompt: "Write a paragraph: what does Dickinson suggest about hope through this extended metaphor?",
      answerKey:
        "Any clear claim supported by two quotations, e.g. hope is small but persistent, always present, strongest in hard times, " +
        "and asks nothing in return. No single correct claim; judged by the rubric.",
    },
  ],
  sources: [
    {
      title: "“Hope” is the thing with feathers — Emily Dickinson (public domain, 1891)",
      sections: [{ ref: "The poem", text: DICKINSON }],
    },
    {
      title: "Teacher notes: Metaphor and poetry analysis",
      sections: [
        {
          ref: "§1 Metaphor vs. extended metaphor",
          text:
            "A metaphor says one thing IS another, without 'like' or 'as' ('The classroom was a zoo'). An extended metaphor " +
            "keeps the comparison going across several lines or a whole poem, adding details that fit the comparison. To find " +
            "one, ask: what is being compared, and which later words only make sense because of that comparison?",
        },
        {
          ref: "§2 Reading symbols",
          text:
            "Weather and journeys often stand for experiences in life. A sunny day can suggest happiness; a long road can suggest " +
            "a lifetime. Look at what the speaker FEELS when the image appears to decide what it might stand for.",
        },
        {
          ref: "§3 Dickinson's style",
          text:
            "Emily Dickinson (1830–1886) wrote short poems with many dashes and unexpected capital letters. The dashes create " +
            "pauses that slow the reader down; capitals can make an ordinary word feel important. Read her poems aloud and pause " +
            "at each dash.",
        },
        {
          ref: "§4 Writing an analysis paragraph",
          text:
            "Claim: what the author suggests (an idea, not just a summary). Evidence: a short quotation, introduced and cited by " +
            "line. Explanation: how the specific words support your claim; this should be longer than the quotation. Example " +
            "with a different text: 'The author shows the city as tiring. She calls the streets “a grey machine” (line 4), " +
            "which makes the city sound cold and endless, as if people are only parts in it.'",
        },
      ],
    },
  ],
  rubric: [
    fourLevels(
      "Claim",
      "States what Dickinson suggests about hope, not a summary.",
      "Clear, specific, arguable claim about the idea of hope.",
      "Clear claim, somewhat general.",
      "Summarizes the poem instead of making a claim.",
      "No claim.",
    ),
    fourLevels(
      "Evidence",
      "Uses quotations from the poem, introduced and cited.",
      "Two or more well-chosen quotations, smoothly introduced and cited.",
      "Two quotations, mostly introduced.",
      "One quotation, or quotations dropped in without context.",
      "No quotations.",
    ),
    fourLevels(
      "Analysis",
      "Explains how specific words build the metaphor and support the claim.",
      "Explains specific word choices in depth and links each to the claim.",
      "Explains the quotations, with some links to the claim.",
      "Mostly restates the quotations.",
      "No explanation.",
    ),
    fourLevels(
      "Conventions",
      "Complete sentences, correct punctuation of quotations.",
      "Clean writing with correctly punctuated quotations.",
      "A few errors that don't get in the way.",
      "Errors make parts hard to follow.",
      "Errors make the paragraph hard to read.",
    ),
  ],
  questions: [
    "What makes a metaphor 'extended' instead of a single metaphor? Use this poem as your example.",
    "Why do you think Dickinson chose a small bird, rather than something big and strong, to stand for hope?",
    "In your own words, what is the difference between summarizing a poem and analyzing it?",
  ],
};

const HISTORY: Practice = {
  joinCode: "HIS008",
  className: "World History — Period 6",
  title: "The Industrial Revolution: Causes and Effects",
  subject: "World History",
  gradeLevel: "8",
  helpLevel: 2,
  instructions:
    "Use the notes and Source C to answer each question in your Google Doc. Answer questions 1–3 in two or three sentences. " +
    "For question 4, write a paragraph that takes a side and supports it with at least two pieces of evidence.",
  problems: [
    {
      id: "1",
      prompt: "Name two inventions from the notes and explain how each changed the way goods were made.",
      answerKey:
        "Any two of: spinning jenny (one worker spins many threads at once), water frame (water-powered spinning, led to mills), " +
        "improved steam engine (power factories anywhere, not just by rivers), railways (move goods and raw materials fast).",
    },
    {
      id: "2",
      prompt: "Explain one reason cities grew so quickly during the Industrial Revolution.",
      answerKey:
        "Factories were built in towns and needed many workers; people moved from farms for factory jobs, especially as farming " +
        "needed fewer workers.",
    },
    {
      id: "3",
      prompt: "Using Source C and §5, describe one way the Factory Act of 1833 would have changed life for a child like the one in Source C.",
      answerKey:
        "Children under 9 could no longer work in textile mills, and children 9–13 were limited to 9 hours a day (and required " +
        "some schooling); inspectors enforced it. The 8-year-old in Source C could not legally work there.",
    },
    {
      id: "4",
      prompt: "Was the Industrial Revolution mostly positive or mostly negative for ordinary workers at the time? Take a side and support it.",
      answerKey:
        "Either side is acceptable if supported by two pieces of evidence from the sources (e.g. cheaper goods and new jobs vs. " +
        "long hours, danger, child labor, crowded cities). Judged by the rubric.",
    },
  ],
  sources: [
    {
      title: "Unit 5 Notes: The Industrial Revolution in Britain",
      sections: [
        {
          ref: "§1 Before the factories",
          text:
            "In the early 1700s most people in Britain lived in the countryside. Cloth was made by hand at home in the " +
            "'domestic system': families spun thread and wove cloth for merchants who paid by the piece. It was slow, and output " +
            "depended on how many hands a family had.",
        },
        {
          ref: "§2 New machines",
          text:
            "From the 1760s inventors found ways to make more thread with less labor. The spinning jenny (James Hargreaves, " +
            "1760s) let one worker spin several threads at once. The water frame (Richard Arkwright, 1769) used a water wheel to " +
            "power spinning, so machines were gathered in mills beside rivers. These were the first modern factories.",
        },
        {
          ref: "§3 Steam power and railways",
          text:
            "James Watt's improvements to the steam engine (patented 1769) made it far more efficient. Steam engines burned coal, " +
            "so factories no longer had to be next to rivers. In 1830 the Liverpool and Manchester Railway opened, carrying " +
            "passengers and goods between a port and a factory city, and railways soon spread across the country.",
        },
        {
          ref: "§4 Growing cities",
          text:
            "Factory towns grew very fast as families left farms to find work. Housing was built quickly and cheaply, often without " +
            "clean water or sewers, so diseases spread easily. Manchester changed from a market town into one of the largest " +
            "industrial cities in the world within a few generations.",
        },
        {
          ref: "§5 Reform: the Factory Act of 1833",
          text:
            "After investigations into conditions in textile mills, Parliament passed the Factory Act of 1833. It banned children " +
            "under 9 from working in textile mills, limited children aged 9 to 13 to 9 hours of work a day, required them to get " +
            "some schooling, and created factory inspectors to enforce the rules. Later laws reduced working hours further.",
        },
      ],
    },
    {
      title: "Source C: A mill worker's day (written by your teacher)",
      sections: [
        {
          ref: "Source C",
          text:
            "This account was written by your teacher to show what a typical day could be like, based on what historians know " +
            "about textile mills around 1830. It is not a real person's words.\n\n" +
            "Mary is eight years old. She wakes at 5 a.m. and walks to the mill in the dark. Her job is to crawl under the " +
            "spinning machines while they run and pick up loose cotton. The room is hot, loud and full of dust. Work lasts until 7 " +
            "in the evening, with short breaks to eat. If she falls asleep, the overseer shouts at her. She earns a few shillings " +
            "a week, which her family needs to pay the rent. She cannot read, because there is no time for school.",
        },
      ],
    },
  ],
  rubric: [
    fourLevels(
      "Historical accuracy",
      "Facts, names and dates match the notes.",
      "All facts are accurate and specific.",
      "Mostly accurate, with a small error.",
      "Several errors or vague statements.",
      "Facts missing or incorrect.",
    ),
    fourLevels(
      "Cause and effect",
      "Explains HOW one change led to another.",
      "Clearly explains causes and their effects with 'because' or 'so'.",
      "Explains most causes and effects.",
      "Lists events without connecting them.",
      "No cause and effect.",
    ),
    fourLevels(
      "Use of sources",
      "Uses evidence from the notes and Source C, and says where it came from.",
      "Uses several pieces of evidence and names the source of each.",
      "Uses evidence from at least one source.",
      "Refers to sources vaguely.",
      "No evidence from sources.",
    ),
    fourLevels(
      "Argument (question 4)",
      "Takes a clear side and supports it.",
      "Clear position, two or more pieces of evidence, and addresses the other side.",
      "Clear position with two pieces of evidence.",
      "Position unclear or supported by one piece of evidence.",
      "No position.",
    ),
  ],
  questions: [
    "Why did steam power change WHERE factories could be built?",
    "Source C was written by your teacher, not by a real mill worker. How should that affect the way you use it as evidence?",
    "Pick one effect of the Industrial Revolution and explain the chain of causes that led to it.",
  ],
};

async function main() {
  const replace = process.argv.includes("--replace");
  const demo = await db.query.classes.findFirst({ where: eq(classes.joinCode, DEMO_JOIN_CODE) });
  if (!demo) throw new Error(`No class with join code ${DEMO_JOIN_CODE}. Run pnpm db:seed first.`);

  const all = [SCIENCE, ENGLISH, HISTORY];
  const existing = await db
    .select({ id: classes.id, joinCode: classes.joinCode, name: classes.name })
    .from(classes)
    .where(inArray(classes.joinCode, all.map((p) => p.joinCode)));
  const todo = replace ? all : all.filter((p) => !existing.some((e) => e.joinCode === p.joinCode));

  await db.transaction(async (tx) => {
    if (replace && existing.length) {
      // Cascades to the class's students, assignments and everything below them.
      await tx.delete(classes).where(inArray(classes.id, existing.map((e) => e.id)));
      console.info(`Removed ${existing.map((e) => `${e.name} (${e.joinCode})`).join(", ")}.`);
    }
    for (const p of todo) {
      const [klass] = await tx
        .insert(classes)
        .values({ teacherId: demo.teacherId, name: p.className, joinCode: p.joinCode })
        .returning();
      const [assignment] = await tx
        .insert(assignments)
        .values({
          classId: klass!.id,
          title: p.title,
          subject: p.subject,
          gradeLevel: p.gradeLevel,
          instructions: p.instructions,
          problems: p.problems,
          helpLevel: p.helpLevel,
          endCheckEnabled: true,
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning();
      for (const s of p.sources) {
        const [source] = await tx
          .insert(sources)
          .values({
            assignmentId: assignment!.id,
            kind: "text",
            title: s.title,
            extractedText: s.sections.map((x) => `${x.ref}\n${x.text}`).join("\n\n"),
          })
          .returning();
        await tx
          .insert(sourceChunks)
          .values(s.sections.map((x, i) => ({ sourceId: source!.id, ref: x.ref, ordinal: i, text: x.text })));
      }
      const [rub] = await tx.insert(rubrics).values({ assignmentId: assignment!.id }).returning();
      await tx.insert(rubricCriteria).values(p.rubric.map((c, i) => ({ ...c, rubricId: rub!.id, ordinal: i })));
      await tx.insert(checkQuestions).values(
        p.questions.map((text, i) => ({ assignmentId: assignment!.id, text, ordinal: i, origin: "teacher" as const, approved: true })),
      );
      console.info(`Added ${p.className}: "${p.title}" (join code ${p.joinCode}).`);
    }
  });

  const skipped = all.filter((p) => !todo.includes(p));
  if (skipped.length) {
    console.info(`Already there, skipped: ${skipped.map((p) => p.joinCode).join(", ")}. Use --replace to recreate them.`);
  }
}

main()
  .catch((err) => {
    console.error("Seeding practice classes failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
