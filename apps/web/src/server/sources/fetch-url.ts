import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Server-side fetch of a teacher-supplied URL, guarded against SSRF: only
 * http(s), only public IP addresses (re-checked on every redirect), with size
 * and time limits.
 *
 * Known gap: the address is checked at lookup time, and fetch resolves again,
 * so a DNS-rebinding host could still race us. Acceptable for a teacher-only,
 * authenticated feature; pin the resolved IP in a custom dispatcher if this is
 * ever exposed to students.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return !blocked.check(mapped[1]!, "ipv4");
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

export class UrlFetchError extends Error {}

export interface FetchedDocument {
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlFetchError("Only http and https links are supported.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new UrlFetchError("That website couldn't be found.");
  if (!addresses.every((a) => isPublicAddress(a.address))) {
    throw new UrlFetchError("That link points to a private network address.");
  }
}

export async function fetchPublicUrl(
  rawUrl: string,
  { maxBytes = 5 * 1024 * 1024, timeoutMs = 10_000, maxRedirects = 3 } = {},
): Promise<FetchedDocument> {
  let url = new URL(rawUrl);
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": "AsteriskAI/0.1 (teacher source import)", Accept: "text/html,application/pdf,text/plain,*/*;q=0.5" },
      });
    } catch {
      throw new UrlFetchError("Couldn't reach that link. Check it and try again.");
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new UrlFetchError(`That page returned an error (HTTP ${res.status}).`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new UrlFetchError("That page is too large to import.");

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UrlFetchError("That page is too large to import.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.byteLength;
    }
    return {
      finalUrl: url.toString(),
      contentType: (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase(),
      body,
    };
  }
  throw new UrlFetchError("That link redirects too many times.");
}

/**
 * Publicly shared Google Docs can be read as plain text via their export
 * endpoint; the normal /edit page is a JavaScript app with no readable text.
 */
export function googleDocExportUrl(rawUrl: string): string | null {
  const match = /^https:\/\/docs\.google\.com\/document\/d\/([\w-]+)/.exec(rawUrl);
  return match ? `https://docs.google.com/document/d/${match[1]}/export?format=txt` : null;
}
