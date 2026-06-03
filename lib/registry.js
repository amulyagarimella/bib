// Registry of shared collections, persisted in Vercel KV (Upstash Redis).
// Each entry: { slug, name, collectionKey, createdAt }
// All entries are read with the ZOTERO_USER_ID / ZOTERO_API_KEY env credentials.

import { Redis } from "@upstash/redis";

const REGISTRY_KEY = "bib:collections";

let _redis;
function client() {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV not configured — set KV_REST_API_URL and KV_REST_API_TOKEN (added by the Vercel KV / Upstash integration)."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

export function slugify(name) {
  const base = (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "collection";
}

export async function listCollections() {
  const all = await client().hgetall(REGISTRY_KEY);
  if (!all) return [];
  return Object.values(all).sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  );
}

export async function getCollection(slug) {
  if (!slug) return null;
  return (await client().hget(REGISTRY_KEY, slug)) || null;
}

export async function addCollection({ name, collectionKey }) {
  const redis = client();
  const existing = (await redis.hgetall(REGISTRY_KEY)) || {};

  // Derive a unique slug from the name.
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (existing[slug]) slug = `${base}-${n++}`;

  const entry = {
    slug,
    name: name.trim(),
    collectionKey: collectionKey.trim(),
    createdAt: Date.now(),
  };
  await redis.hset(REGISTRY_KEY, { [slug]: entry });
  return entry;
}

export async function deleteCollection(slug) {
  if (!slug) return false;
  const removed = await client().hdel(REGISTRY_KEY, slug);
  return removed > 0;
}
