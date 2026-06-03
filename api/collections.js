// Admin API for the registry of shared collections.
// Protected by Basic Auth at the edge (see middleware.js).
//   GET    /api/collections        → list shares
//   POST   /api/collections        → add a share { name, collectionKey }
//   DELETE /api/collections?slug=…  → remove a share

import {
  listCollections,
  addCollection,
  deleteCollection,
} from "../lib/registry.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const collections = await listCollections();
      res.status(200).json({ collections });
      return;
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const name = (body.name || "").trim();
      const collectionKey = (body.collectionKey || "").trim();
      if (!name || !collectionKey) {
        res.status(400).json({ error: "name and collectionKey are required." });
        return;
      }
      const entry = await addCollection({ name, collectionKey });
      res.status(201).json({ collection: entry });
      return;
    }

    if (req.method === "DELETE") {
      const slug = (req.query?.slug || "").toString();
      if (!slug) {
        res.status(400).json({ error: "slug is required." });
        return;
      }
      const removed = await deleteCollection(slug);
      res.status(removed ? 200 : 404).json({ ok: removed });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
