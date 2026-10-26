import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/server/auth";
import { logout } from "../login/actions";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const teacher = await requireTeacher();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Asterisk<span className="text-primary">*</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{teacher.displayName}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
