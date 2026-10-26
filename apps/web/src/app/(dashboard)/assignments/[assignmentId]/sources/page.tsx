import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAssignmentForTeacher, listSourcesWithChunks } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { estimateTokens } from "@/server/sources/chunk";
import { DeleteSourceButton, SourceUploader } from "./source-uploader";

// Muse Spark's context window is 1,048,576 tokens. Leave most of it for the
// conversation, prompts and student drafts.
const SOURCE_TOKEN_BUDGET = 600_000;

const KIND_LABEL = { pdf: "PDF", docx: "Word", text: "Text", url: "Link" } as const;

export default async function SourcesPage({ params }: PageProps<"/assignments/[assignmentId]/sources">) {
  const { assignmentId } = await params;
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) notFound();
  const sourceList = await listSourcesWithChunks(assignment.id);

  const totalTokens = estimateTokens(sourceList.reduce((n, s) => n + s.charCount, 0));
  const fits = totalTokens <= SOURCE_TOKEN_BUDGET;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a source</CardTitle>
          <CardDescription>
            Asterisk answers only from these materials and cites the page or section it used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourceUploader assignmentId={assignment.id} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Sources <span className="text-muted-foreground">({sourceList.length})</span>
          </h2>
          {sourceList.length > 0 && (
            <p className={fits ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              ≈{totalTokens.toLocaleString()} tokens
              {fits ? " · fits in Muse Spark's context" : " · too large to send in full; remove some sources"}
            </p>
          )}
        </div>

        {sourceList.length === 0 ? (
          <p className="text-muted-foreground">
            No sources yet. Without sources, Asterisk will tell students to ask you instead of guessing.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sourceList.map((s) => (
              <li key={s.id}>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <span className="truncate">{s.title}</span>
                        <Badge variant="secondary">{KIND_LABEL[s.kind]}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {s.chunks.length} {s.chunks.length === 1 ? "section" : "sections"} · ≈
                        {estimateTokens(s.charCount).toLocaleString()} tokens
                        {s.url && (
                          <>
                            {" · "}
                            <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                              open link
                            </a>
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <DeleteSourceButton assignmentId={assignment.id} sourceId={s.id} title={s.title} />
                  </CardHeader>
                  <CardContent>
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        Show extracted text by citation
                      </summary>
                      <ol className="mt-3 flex flex-col gap-3">
                        {s.chunks.map((c) => (
                          <li key={c.id} className="rounded-md bg-muted/50 p-3">
                            <p className="mb-1 font-mono text-xs font-semibold">{c.ref}</p>
                            <p className="line-clamp-6 text-sm whitespace-pre-line">{c.text}</p>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
