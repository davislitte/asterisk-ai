/**
 * Allowlist patterns are host + path with `*` wildcards, no scheme:
 *   docs.google.com/document/*   any Google Doc
 *   *.example.edu/course/*       any subdomain of example.edu under /course/
 * A pattern with no path matches every page on that host.
 * Query strings and fragments are ignored.
 */

/** Teachers paste full URLs; keep only host + path (drop scheme, query, fragment). */
export function normalizeAllowlistPattern(pattern: string): string {
  return pattern
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[?#].*$/, "");
}

export function matchesAllowlist(url: string, patterns: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const target = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  return patterns.some((pattern) => patternToRegExp(pattern).test(target));
}

function patternToRegExp(pattern: string): RegExp {
  let p = normalizeAllowlistPattern(pattern).toLowerCase();
  if (!p.includes("/")) p = `${p}/*`;
  const [host = "", ...pathParts] = p.split("/");
  const path = `/${pathParts.join("/")}`;

  // In the host, `*` matches one or more whole labels; in the path, anything.
  const hostRe = host
    .split(".")
    .map((label) => (label === "*" ? "[^/]+" : escapeRegExp(label)))
    .join("\\.");
  const pathRe = path.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${hostRe}${pathRe}$`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
