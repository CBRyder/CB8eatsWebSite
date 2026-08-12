# CB8eatsWebSite

CB8eats' personal site — game design, music, and server projects. Started as a simple
static homepage; has grown into a small multi-section site with two live,
Firebase-backed interactive trackers. Multiple sessions (this one and others) have
worked on this repo — this file is the shared memory across them.

## Live site

- **Custom domain:** `www.iltep.cb8eats.com` (see `CNAME`)
- **Deployment:** Cloudflare Workers (Workers Assets), config in `wrangler.jsonc`
  (`"assets": { "directory": "." }` — serves the repo root as static assets, no build
  step). This *replaced* an earlier GitHub Pages deployment
  (`cbryder.github.io/CB8eatsWebSite/`) — GitHub Pages may still be enabled as a
  fallback, but Cloudflare + the custom domain is the real live site now.
- **Gotcha:** a Worker `html_handling: "strip"`-style setting was tried once to drop
  `.html` from URLs and it broke the homepage entirely (see commits "Disable the
  .html-stripping redirect on the Worker" / "Revert html_handling: none"). Current
  `wrangler.jsonc` intentionally has no `html_handling` override — leave it that way
  unless you're prepared to test every page's routing before merging.

## Site structure

Plain static HTML/CSS/vanilla JS, no build step, no framework. Shared styling lives in
`css/style.css` (dark theme, CSS custom properties on `:root`, currently a green/purple
accent — `--accent: #00d95f` — this has changed at least once already, check the live
value before assuming it's still red/pink from an old memory).

Top-level nav: **Home** (`index.html`) · **Designs** (`designs.html`) · **Music**
(`music.html`) · **COA: Vampire Knights** (`coa.html`) · **Tarboro Life**
(`tarboro-life.html`).

Both `coa.html` and `tarboro-life.html` are hub pages linking out to lore/detail
subpages via a `.grid.grid-3` card grid:

- **COA: Vampire Knights** (an original game project) → `world.html`, `factions.html`,
  `story.html`, plus `coa-tracker.html` (bug/system tracker, see below).
- **Tarboro Life** (a FiveM RP server) → `jobs.html`, `businesses.html`, `gangs.html`,
  `activities.html`, `apply.html` (staff application form), plus `tracker.html`
  (resource tracker, see below).

`music.html` has Spotify track embeds (`.spotify-embed` iframe) and self-hosted
`<audio>` players for uploaded `audio/*.m4a` files.

Static reference docs: `Tarboro Life Design Doc.pdf`, `Tarboro Life Server
Rulebook.pdf`, `coa zone map.pdf` — linked directly from the relevant pages, not
embedded (embedding via iframe was tried and reverted; all three PDFs are multi-page
and were awkward to read that way — see git history around "Revert PDF iframe
embeds").

## The two trackers (JSON-driven + Firebase-backed)

`tracker.html` (Tarboro Life resources) and `coa-tracker.html` (COA systems) are the
most complex pages on the site. Both follow the same pattern:

1. **Content is data, not hardcoded HTML.** Each fetches its own JSON file at load —
   `resource-inventory.json` for `tracker.html`, `coa-inventory.json` for
   `coa-tracker.html` — and renders category/item rows from it. **Updating the
   checklist content is "replace the JSON file and push," not "edit the HTML."** JSON
   shape: `{ compiled, source, caveat, categories: [{ cat, items: [{ name, status
   (crit|warn|good), desc, note? }] }] }`. The header's compiled date/subtitle/caveat
   banner and the stat-strip/filter-button counts are all computed from the fetched
   JSON, not hardcoded.
2. **Mark-off checkboxes sync live across every device** via Firebase Firestore, not
   `localStorage` — check a box on your phone, it updates on your laptop instantly,
   no refresh.
3. **Checkbox writes are gated behind sign-in**, view is public. Only
   `cbleo73@gmail.com` can check things off; anyone can view the checklist and its
   current state.

### Firebase project: `tarborolifebackend`

Both trackers share one Firebase project (client config — `apiKey` etc. — is
intentionally public in the page source; that's normal for Firebase, security is
enforced by Firestore rules, not by hiding the key):

```js
{
  apiKey: "AIzaSyDSWXJrKwLTwsW6Caadl2m1BPDwOH5ROiU",
  authDomain: "tarborolifebackend.firebaseapp.com",
  projectId: "tarborolifebackend",
  storageBucket: "tarborolifebackend.firebasestorage.app",
  messagingSenderId: "578368600107",
  appId: "1:578368600107:web:e8ce50f4c4ab2839c4126e",
}
```

Firestore doc per tracker (different collection per tracker, same shape):
- `tarboroLife/testedResources` → `tracker.html`
- `coaVamp/testedResources` → `coa-tracker.html`

Both docs hold `{ tested: { "<resource-name>": true|false } }`. A resource only gets a
key once someone actually toggles its checkbox — untouched items simply aren't in the
map (absence == untested, same as an explicit `false`). Toggling **off** writes an
explicit `false` rather than deleting the key, by design (so there's a record either
way) — **do not** "optimize" this into a delete.

Security rules (Firebase console → Firestore → Rules, not stored in this repo) gate
writes to the authorized email per collection, e.g.:

```
match /tarboroLife/testedResources {
  allow read: if true;
  allow write: if request.auth != null
               && request.auth.token.email == 'cbleo73@gmail.com'
               && request.resource.data.keys().hasOnly(['tested'])
               && request.resource.data.tested is map;
}
```
(mirrored for `coaVamp/testedResources`).

**Auth method: email/password, not Google Sign-In.** Google Sign-In was tried first
(both popup and redirect flow) and reliably failed across Brave and Edge — the OAuth
consent screen completed every time, but the result never made it back to the app.
Root cause was almost certainly Chromium's third-party storage partitioning breaking
the handoff through the Firebase authDomain (`tarborolifebackend.firebaseapp.com`), a
different origin than the site. **Do not re-introduce Google Sign-In** without solving
that cross-origin problem first (e.g. a custom authDomain matching the site's own
domain) — email/password sidesteps it entirely (no popup, no redirect, no cross-domain
handoff) and is what's live now.

### Known Firestore bug (fixed, don't reintroduce)

An early version called `setDoc(docRef, { tested: {} }, { merge: true })` on every
page load as a "make sure the doc exists" no-op. `merge: true` only merges at the
level of fields actually passed — since `tested` was passed as a whole empty object
(not a dotted sub-path), every call **replaced the entire tested map with `{}`**,
silently wiping every checked box on every reload by whoever had write access. Fixed
by removing that write entirely (the doc already exists; it was never load-bearing
after the very first run). If you ever need an "ensure doc exists" write again, use a
dotted field path or check existence first — never `set(..., { merge: true })` with a
whole nested object as the value for an existing map field.

## Conventions

- One branch per change (`claude/<description>`), PR opened against `main`, squash
  merge. Git history is full of small, single-purpose PRs — keep following that
  pattern rather than batching unrelated changes.
- No build step, no package.json — just static files. `wrangler.jsonc` deploys the
  repo root as-is.
- GitHub Pages serving (if still enabled) is case-sensitive on file paths (Linux-based)
  — asset `src`/`href` capitalization must match the real filename exactly.
