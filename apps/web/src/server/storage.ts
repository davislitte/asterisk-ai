import "server-only";
import { randomUUID } from "node:crypto";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Supabase Storage for original uploads (and, later, recorded answers).
 * Server-side only, with the service-role key; buckets are private.
 * If Supabase isn't configured, uploads are skipped: the extracted text in
 * Postgres is what the product actually uses.
 */

const SOURCES_BUCKET = "sources";

let client: SupabaseClient | null | undefined;
const ensuredBuckets = new Map<string, Promise<void>>();

function storage(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

function ensureBucket(sb: SupabaseClient, bucket: string): Promise<void> {
  let ensured = ensuredBuckets.get(bucket);
  if (!ensured) {
    ensured = (async () => {
      const { error } = await sb.storage.createBucket(bucket, { public: false });
      if (error && !/already exists/i.test(error.message)) throw error;
    })();
    ensured.catch(() => ensuredBuckets.delete(bucket));
    ensuredBuckets.set(bucket, ensured);
  }
  return ensured;
}

/** Returns the object key, or null if storage isn't configured or the upload failed. */
export async function uploadSourceFile(
  assignmentId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const sb = storage();
  if (!sb) {
    console.warn("[storage] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; keeping extracted text only.");
    return null;
  }
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-100);
  const key = `${assignmentId}/${randomUUID()}-${safeName}`;
  try {
    await ensureBucket(sb, SOURCES_BUCKET);
    const { error } = await sb.storage
      .from(SOURCES_BUCKET)
      .upload(key, bytes, { contentType: contentType || "application/octet-stream", upsert: false });
    if (error) throw error;
    return key;
  } catch (err) {
    console.error("[storage] upload failed; keeping extracted text only", err);
    return null;
  }
}

export async function deleteSourceFile(key: string): Promise<void> {
  const sb = storage();
  if (!sb) return;
  const { error } = await sb.storage.from(SOURCES_BUCKET).remove([key]);
  if (error) console.error("[storage] delete failed", error);
}
