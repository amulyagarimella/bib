# bib — share selected private Zotero collections as unlisted links

A small Vercel app to share **chosen** Zotero collections with collaborators —
each as its own clean, unlisted page — without creating or inviting anyone to a
Zotero group.

- A **password-protected home screen** lists your shares and lets you add/remove
  collections (registry stored in Vercel KV).
- Each share gets a public, **unlisted** page at `/c/<slug>` rendering the
  collection: nested sub-folders flattened, duplicates collapsed (by DOI / title),
  a client-side filter, and a force-reload button.
- A read-only Zotero API key stays server-side; the browser never sees it.

```
middleware.js        Basic Auth on "/" + "/api/collections"  (collection pages stay public)
index.html           home: list shares, add/delete            (protected)
collection.html      the reader, parameterized by /c/<slug>   (public, unlisted)
vercel.json          rewrite /c/:slug → collection.html
api/collections.js   GET list · POST add · DELETE remove       (registry CRUD)
api/items.js         GET ?slug=… → fetch/flatten/dedup/notes   (public)
lib/registry.js      Vercel KV (Upstash Redis) helpers
assets/fonts/        bundled Valley Sans woff2 (SIL OFL)
```

## Setup

### 1. Zotero
- **`ZOTERO_USER_ID`** — numeric ID at <https://www.zotero.org/settings/keys>.
- **`ZOTERO_API_KEY`** — a **read-only** key (same page → New Private Key).
- A collection's **key** is the code after `/collections/` in its Zotero web URL.

### 2. Vercel KV (registry store)
In the Vercel dashboard → **Storage** → create a **KV / Upstash Redis** store and
connect it to this project. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

### 3. Environment variables
Set these in **Project → Settings → Environment Variables** (see `.env.example`):

| Var | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | password for the home screen (required) |
| `ADMIN_USER` | username for the home screen (optional, default `admin`) |
| `ZOTERO_USER_ID` | your Zotero account |
| `ZOTERO_API_KEY` | your read-only key |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | added by the KV store |

### 4. Run / deploy
```bash
cp .env.example .env.local   # fill in values (KV vars come from `vercel env pull`)
vercel dev                   # local
vercel --prod                # production
```
(Git-based deploys work too — push to the connected repo.)

## Using it
1. Open the site → enter the admin password.
2. **Add a collection**: give it a name + the Zotero collection key.
3. Copy the unlisted `/c/<slug>` link and send it to collaborators — no password
   needed to view a collection page.

## Notes
- Collection pages are **unlisted, not access-controlled**: anyone with the link
  can view (search engines are discouraged via `noindex`). Only the home/admin
  screen is password-gated.
- Stored per-collection API keys live in your private KV store and are never
  returned to the browser.
- Reader responses are edge-cached 10 min; the **Reload** button bypasses it.
- Set in **Valley Sans** (bundled woff2, SIL Open Font License — see
  `assets/fonts/OFL.txt`).
