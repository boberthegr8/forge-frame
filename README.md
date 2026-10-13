# Forge Frame

MiTek-Supply-style BOM estimator with a 3D model view, part of the Forge Suite.
Lives at `https://frame.forgehub.dev`.

## What this is

A single-file static app (`index.html`) plus one small serverless API
(`api/ai.js`, `api/ai/status.js`) that proxies AI calls so the API keys never
reach the browser. No build step, no framework — `index.html` is served as-is.

## Status

`index.html` here is a **placeholder**. The real app (`forge-frame-young.html`)
could not be located on this device during this prep pass — see `FINALIZE.md`
in the project root for where to drop it in. Everything else in this folder
(API, config, docs) is ready to go as soon as that file lands.

Once the real file is in place, the two Claude-artifact-only APIs it used to
call need to be ported to what's already wired up here:

1. **Downloads** — replace `saveFile()` with a normal browser download:
   ```js
   function saveFile(filename, content, mimeType) {
     const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || 'application/octet-stream' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = filename;
     document.body.appendChild(a);
     a.click();
     a.remove();
     URL.revokeObjectURL(url);
   }
   ```

2. **AI** — `aiReview`, `aiFirstPass`, `aiMatch` currently call
   `window.claude.use('sample')`. Point them at `POST /api/ai` instead:
   ```js
   async function callAI(prompt, images = [], tier = 'text') {
     const res = await fetch('/api/ai', {
       method: 'POST',
       headers: { 'content-type': 'application/json' },
       body: JSON.stringify({ prompt, images, tier })
     });
     if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'AI call failed');
     return res.json(); // already-parsed JSON from the model
   }
   ```
   `images` is an array of `{ data: base64String, mimeType: 'image/png' }`.

   On page load, check `GET /api/ai/status` and hide the AI buttons if
   `{ enabled: false }`:
   ```js
   fetch('/api/ai/status').then(r => r.json()).then(({ enabled }) => {
     document.querySelectorAll('[data-ai-feature]').forEach(el => el.hidden = !enabled);
   }).catch(() => {
     document.querySelectorAll('[data-ai-feature]').forEach(el => el.hidden = true);
   });
   ```

Remove any leftover `window.claude` references once ported. `localStorage`
usage is unaffected and should be left as-is.

## Env vars

Set these in the Vercel project (Settings → Environment Variables), not in
the repo. See `.env.example`.

| Var | Purpose |
|---|---|
| `AI_PROVIDER` | `anthropic` or `gemini` |
| `ANTHROPIC_API_KEY` | required if `AI_PROVIDER=anthropic` |
| `GEMINI_API_KEY` | required if `AI_PROVIDER=gemini` |
| `AI_MODEL_VISION` | model used for calls that include images |
| `AI_MODEL_TEXT` | model used for text-only calls |

If no key is set for the active provider, `/api/ai/status` reports
`{ enabled: false }` and `/api/ai` returns `503` — the page should hide its
AI buttons rather than show a broken feature.

## Deploy

```bash
# one-time
vercel link        # link this folder to the "forge-frame" Vercel project
vercel env add ANTHROPIC_API_KEY production
vercel env add AI_PROVIDER production

# deploy
vercel --prod
```

See `FINALIZE.md` in the project root for the full first-time setup
(GitHub repo, Vercel project, domain, DNS) — those steps need approvals this
pass skipped on purpose.

## Local test

```bash
cd forge-frame
npx serve .          # or: python3 -m http.server 8080
```

Open the page, confirm no console errors, the 3D view renders, the BOM tab
fills, CSV/PDF downloads work, and the AI buttons are hidden when no API key
is configured (the default on a fresh clone with no `.env.local`).
