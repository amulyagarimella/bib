// Vercel Serverless Function (public).
// Resolves a shared collection by ?slug=… from the registry, then forwards
// only that collection (and its nested subcollections) to the client. The
// Zotero API key is held server-side and never reaches the browser.

import { getCollection } from "../lib/registry.js";

const ZOTERO_API_BASE = "https://api.zotero.org";
const PAGE_SIZE = 100; // Zotero's max per request

export default async function handler(req, res) {
  // Resolve the shared collection from ?slug=… via the registry.
  const slug = (req.query?.slug || "").toString();
  if (!slug) {
    res.status(400).json({ error: "Missing collection." });
    return;
  }

  let entry;
  try {
    entry = await getCollection(slug);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
    return;
  }
  if (!entry) {
    res.status(404).json({ error: "Unknown collection." });
    return;
  }

  const { name, collectionKey } = entry;
  const userId = process.env.ZOTERO_USER_ID;
  const apiKey = process.env.ZOTERO_API_KEY;
  if (!userId || !apiKey) {
    res.status(500).json({
      error: "Not configured. Set ZOTERO_USER_ID and ZOTERO_API_KEY.",
    });
    return;
  }

  const headers = {
    "Zotero-API-Key": apiKey,
    "Zotero-API-Version": "3",
  };

  // Page through any Zotero list endpoint, following Total-Results.
  async function fetchAll(path) {
    let results = [];
    let start = 0;
    let total = Infinity;
    while (start < total) {
      const sep = path.includes("?") ? "&" : "?";
      const url = `${ZOTERO_API_BASE}${path}${sep}limit=${PAGE_SIZE}&start=${start}`;
      const upstream = await fetch(url, { headers });
      if (!upstream.ok) {
        const body = await upstream.text();
        const err = new Error(`Zotero responded ${upstream.status}`);
        err.status = upstream.status;
        err.detail = body.slice(0, 500);
        throw err;
      }
      const batch = await upstream.json();
      results = results.concat(batch);
      total = parseInt(upstream.headers.get("Total-Results") || "0", 10);
      start += PAGE_SIZE;
      if (batch.length === 0) break;
    }
    return results;
  }

  // Walk the subcollection tree breadth-first, returning the root key plus
  // every descendant collection key. Zotero has no recursive items endpoint,
  // so we gather the folder keys ourselves.
  async function gatherCollectionKeys(rootKey) {
    const keys = [rootKey];
    const queue = [rootKey];
    while (queue.length) {
      const parent = queue.shift();
      const children = await fetchAll(
        `/users/${userId}/collections/${parent}/collections?format=json`
      );
      for (const child of children) {
        if (child.key && !keys.includes(child.key)) {
          keys.push(child.key);
          queue.push(child.key);
        }
      }
    }
    return keys;
  }

  function parseTimestamp(date) {
    // Zotero dates are free-form; pull a year for ordering, fall back to -Inf.
    const m = (date || "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : -Infinity;
  }

  try {
    const collectionKeys = await gatherCollectionKeys(collectionKey);

    // Fetch each folder's top-level items (skips attachments/notes). Duplicates
    // (an item in several folders, or the same work imported twice) are
    // collapsed by the signature dedup below.
    const raw = [];
    for (const key of collectionKeys) {
      const items = await fetchAll(
        `/users/${userId}/collections/${key}/items/top?format=json&include=data`
      );
      raw.push(...items);
    }
    raw.sort((a, b) => parseTimestamp(b.data?.date) - parseTimestamp(a.data?.date));

    // Strip down to only the fields the frontend renders — nothing identifying
    // about the library or key leaks through.
    const cleaned = raw.map((it) => {
      const d = it.data || {};
      return {
        key: it.key,
        itemType: d.itemType,
        title: d.title || d.caseName || d.subject || "(untitled)",
        creators: (d.creators || []).map((c) => ({
          firstName: c.firstName || "",
          lastName: c.lastName || c.name || "",
          name: c.name || "",
        })),
        date: d.date || "",
        publication:
          d.publicationTitle ||
          d.bookTitle ||
          d.proceedingsTitle ||
          d.publisher ||
          d.repository ||
          "",
        url: d.url || (d.DOI ? `https://doi.org/${d.DOI}` : ""),
        DOI: d.DOI || "",
        abstractNote: d.abstractNote || "",
        tags: (d.tags || []).map((t) => t.tag),
      };
    });

    // Dedup by content: collapse the same item filed in several folders AND the
    // same work that exists as multiple distinct Zotero items (imported twice).
    // Signature = DOI when present, else normalized title + first author.
    const signature = (item) => {
      if (item.DOI) {
        const doi = item.DOI.trim()
          .toLowerCase()
          .replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
        if (doi) return "doi:" + doi;
      }
      const title = (item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (title && title !== "untitled") {
        const a = item.creators[0];
        const author = a
          ? (a.lastName || a.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
          : "";
        return "title:" + title + "|" + author;
      }
      return "key:" + item.key; // nothing to match on — keep it as unique
    };

    // Prefer the richest copy when collapsing duplicates.
    const completeness = (item) =>
      (item.abstractNote ? 2 : 0) +
      (item.url ? 1 : 0) +
      (item.DOI ? 1 : 0) +
      item.tags.length * 0.1;

    const bySignature = new Map();
    for (const item of cleaned) {
      const sig = signature(item);
      const existing = bySignature.get(sig);
      if (!existing || completeness(item) > completeness(existing)) {
        bySignature.set(sig, item); // same key keeps the original sort position
      }
    }
    const deduped = Array.from(bySignature.values());

    // Cache at Vercel's edge so we don't hammer the Zotero API.
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ name, items: deduped });
  } catch (err) {
    const status = err.status || 502;
    res
      .status(status)
      .json({ error: err.message || "Failed to reach Zotero", detail: err.detail });
  }
}
