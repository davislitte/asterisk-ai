"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function AssignmentTabs({ assignmentId }: { assignmentId: string }) {
  const pathname = usePathname();
  const base = `/assignments/${assignmentId}`;
  const tabs = [
    { href: base, label: "Details" },
    { href: `${base}/sources`, label: "Sources" },
    { href: `${base}/rubric`, label: "Rubric" },
    { href: `${base}/questions`, label: "Check questions" },
    { href: `${base}/monitor`, label: "Monitor" },
  ];

  return (
    <nav aria-label="Assignment sections" className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
