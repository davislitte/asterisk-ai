import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AI_HOST_LABELS, effectiveAiHost } from "@/server/ai-host";
import { requireViewer } from "@/server/auth";
import { logout } from "../login/actions";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const [teacher, aiHost] = await Promise.all([requireViewer(), effectiveAiHost()]);
  const host = AI_HOST_LABELS[aiHost];

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Asterisk<span className="text-primary">*</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              title={`AI: ${host.model} on ${host.where}. Change it on the home page.`}
              className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline ${
                aiHost === "district" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {host.model}
              {aiHost === "district" ? " · district-hosted" : ""}
            </Link>
            <span className="text-muted-foreground">{teacher.displayName}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                {teacher.guest ? "Exit guest view" : "Sign out"}
              </Button>
            </form>
          </div>
        </div>
      </header>
      {teacher.guest && (
        <p className="border-b bg-primary/5 px-4 py-2 text-center text-sm">
          Guest view of a sample class with made-up students. Read-only: editing and AI actions are turned off.
        </p>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* A disabled fieldset disables every form control inside it. The server refuses guests either way. */}
        {teacher.guest ? (
          <fieldset disabled className="contents">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </main>
    </>
  );
}
