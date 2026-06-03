# bib — share one private Zotero collection

A tiny site that renders the references in a **single** Zotero collection —
flattened across any nested sub-folders — without creating or inviting anyone
to a Zotero group.

A read-only Zotero API key lives server-side in a Vercel serverless function
(`api/items.js`). The browser only ever sees the cleaned-up items for the one
collection you configured — never the key, your username, or the rest of your library.

```
index.html        static frontend (Helvetica Neue, client-side filter)
api/items.js       serverless proxy; holds the key, recurses + flattens one collection tree
.env.example       the three values you need to set
```

## 1. Get your Zotero values

- **`ZOTERO_USER_ID`** — your numeric user ID, shown at
  <https://www.zotero.org/settings/keys> ("Your userID for use in API calls is …").
- **`ZOTERO_API_KEY`** — create a new key at
  <https://www.zotero.org/settings/keys/new> with **read-only** library access.
- **`ZOTERO_COLLECTION_KEY`** — open the collection in the
  [web library](https://www.zotero.org/mylibrary); the key is the segment after
  `/collections/` in the URL (an 8-character code like `ABCD2345`).

## 2. Run locally

```bash
npm i -g vercel        # if you don't have it
cp .env.example .env.local   # fill in the three values
vercel dev             # serves index.html + /api/items
```

Open the printed localhost URL.

## 3. Deploy to Vercel

```bash
vercel          # first run links/creates the project
vercel --prod   # deploy to production
```

Then add the three environment variables in the Vercel dashboard
(**Project → Settings → Environment Variables**) and redeploy, or run:

```bash
vercel env add ZOTERO_USER_ID
vercel env add ZOTERO_COLLECTION_KEY
vercel env add ZOTERO_API_KEY
vercel --prod
```

## Notes

- The page heading/subtitle are cosmetic — edit `PAGE_TITLE` / `PAGE_SUBTITLE`
  near the bottom of `index.html`.
- Responses are cached at Vercel's edge for 10 minutes
  (`s-maxage=600, stale-while-revalidate=3600`) to stay well under Zotero's rate limits.
- `<meta name="robots" content="noindex">` discourages search engines. This is
  "unlisted," not access-controlled — anyone with the URL can view it. If you need
  real auth, put it behind Vercel password protection or add a check in `api/items.js`.
- A Zotero API key technically grants read access to your whole library, but the
  key never leaves the server and the function only queries the one collection.
