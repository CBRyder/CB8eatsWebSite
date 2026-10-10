# CB8eatsWebSite

CB8eats' personal site — game design, music, and server projects. Started as a simple
static homepage; has grown into a small multi-section site with two live,
Firebase-backed interactive trackers. Multiple sessions (this one and others) have
worked on this repo — this file is the shared memory across them.

## Live site

- **Custom domain:** `www.iltep.cb8eats.com` (see `CNAME`)
- **Deployment:** Cloudflare Workers, config in `wrangler.jsonc`. **Cloudflare's Git
  integration is connected** (Workers & Pages → this worker → Builds) — every push to
  `main` auto-deploys, no manual `wrangler deploy` needed. This *replaced* an earlier
  GitHub Pages deployment (`cbryder.github.io/CB8eatsWebSite/`) — GitHub Pages may
  still be enabled as a fallback, but Cloudflare + the custom domain is the real live
  site now.
- **This sandbox cannot reach `api.cloudflare.com`** (blocked by network policy — a
  403 at the egress proxy, not a token problem) — `wrangler deploy` cannot be run from
  a Claude Code Remote session against this repo. Rely on the Git integration instead;
  if it's ever disconnected, deploying needs to happen from a machine with normal
  network access (the owner's, not this sandbox).
- **Not pure static assets anymore** — `wrangler.jsonc` has `"main": "worker.js"` with
  the site served through `env.ASSETS.fetch(request)` as the fallback path. The one
  exception is `POST /api/send-application-confirmation` (see Staff Applications form
  below), which `worker.js` intercepts itself. Keep that pattern — check the request
  path first, fall through to `ASSETS` for everything else — rather than growing the
  worker into something that re-implements static serving.
- **Static files bypass the Worker by default.** A request that matches a file (like
  `/` -> `index.html`) is served straight from the assets and never runs `worker.js`.
  `wrangler.jsonc` therefore sets `assets.run_worker_first` to `["/"]` so the Worker
  sees the front page (needed for the `dev.cb8eats.com` hostnames, see the Dev hub
  section), plus the dev pages and their data files (so `worker.js` can keep them off
  every hostname except the dev one). Every other path is still served directly from the
  assets. If a new hostname-based rewrite or block ever has to run for another path, add
  that path to the list rather than setting it to `true`. The list in `wrangler.jsonc`
  and `DEV_PAGES` / `DEV_DATA` in `worker.js` must stay in step.
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
(`tarboro-life.html`). A **Dev** tab is appended to this menu only in a browser where
the owner (or a listed dev) has signed in — see "Dev hub" below.

Both `coa.html` and `tarboro-life.html` are hub pages linking out to lore/detail
subpages via a `.grid.grid-3` card grid:

- **COA: Vampire Knights** (an original game project) → `world.html`, `factions.html`,
  `story.html`, plus `coa-bug-report.html` (public bug report form, see below). The
  COA tracker is **not** linked from here any more — it lives under the Dev hub.
- **Tarboro Life** (a FiveM RP server) → `jobs.html`, `businesses.html`, `gangs.html`,
  `activities.html`, `apply.html` (staff application form). The resource tracker is
  **not** linked from here any more — it lives under the Dev hub.

`music.html` has Spotify track embeds (`.spotify-embed` iframe) and self-hosted
`<audio>` players for uploaded `audio/*.m4a` files.

Static reference docs: `Tarboro Life Design Doc.pdf`, `Tarboro Life Server
Rulebook.pdf`, `coa zone map.pdf` — linked directly from the relevant pages, not
embedded (embedding via iframe was tried and reverted; all three PDFs are multi-page
and were awkward to read that way — see git history around "Revert PDF iframe
embeds").

## The two trackers (JSON-driven + Firebase-backed)

`tracker.html` (Tarboro Life resources) and `coa-tracker.html` (COA systems) are the
most complex pages on the site. They are **dev pages now**: no public page links to
them (reached from the Dev hub, `dev.html`), they carry `noindex`, they share the Dev
hub's theme and header, and sign-in is the button at the top right of the header
(`js/dev-auth.js`), not a form on the page — see the Dev hub section. Both follow the
same pattern:

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

**Second field, added 2026-08-13: `bugged`.** Same doc, a sibling top-level map with
the identical shape and dotted-path-write convention as `tested`
(`{ bugged: { "<resource-name>": true|false } }` for legacy items,
`{ bugged: { "<name>": { "<checkId>": true|false } } }` for per-behavior items) — a
fully independent signal, not a replacement or a sub-field of `tested`. Lets the owner
mark a specific behavior as "tried it, it's broken" distinctly from either "untested" or
"tested and works", so a bugged item can be found again later without re-reading every
row. Rendered as a second checkbox next to the tested one on every row/sub-row
(`.bugged-check` class, red accent vs. the tested checkbox's green, plus a "Bugged
only" filter toggle and a 🐛 count badge on collapsed checks-based rows) — same
sign-in-gated write pattern as `tested`.

**Third field, added 2026-08-17: `na`.** Same doc, another sibling top-level map with
the identical shape and dotted-path-write convention as `tested`/`bugged`
(`{ na: { "<resource-name>": true|false } }` for legacy items,
`{ na: { "<name>": { "<checkId>": true|false } } }` for per-behavior items) — marks
something as "doesn't apply right now" (distinct from simply being untested — untested
means "no info yet", N/A means "actively not relevant at the moment"). Rendered as a
third checkbox, positioned right of the bugged checkbox and left of the item name
(`.na-check` class, faint/gray accent — deliberately the quietest of the three colors,
neither the tested checkbox's green nor the bugged checkbox's red). Same
sign-in-gated write pattern as the other two. **All three states are mutually
exclusive** — checking any one of tested/bugged/na force-clears the other two on that
same row or check, both in the UI and in the saved Firestore state (not just visually),
mirroring the tested↔bugged exclusion that already existed. Checks-based (dropdown)
items have no parent-level bugged or na checkbox, same as before — that state lives on
the individual sub-checks inside the expanded row, reached via the tested-cell's
chevron+fraction+hint-dots toggle.

**The status chip auto-upgrades to "Confirmed working" once fully tested, added
2026-09-21.** `it.status` (crit/warn/good/planned) is a manually-authored claim in the
JSON about build state — it was never wired to update itself, so an item could sit
fully checked off (every behavior confirmed tested live) while its chip still read
"Built, Untested" forever, a visibly contradictory signal nobody had gone back to fix.
Rather than requiring a JSON edit, the chip is now partly computed: `riUpdateStatusChip(row,
allDone)` — called from every place that already recomputes a row's tested state
(`riApplyState`'s two branches, `riRecomputeParentRow`, and optimistically inside each
legacy tested/bugged/na change handler) — swaps the chip to a distinct `.chip.verified`
style (`--ri-verified`, teal, deliberately not reusing `--ri-good`'s green so the two
are never confused at a glance) reading "Confirmed working" whenever every check on
that item is tested (or, for legacy items, whenever the single tested flag is true).
Anything less than 100% falls back to rendering `it.status`/`RI_STATUS_LABEL[status]`
exactly as authored, read back from the row's own `data-status-val` attribute rather
than needing the original status threaded through as a parameter everywhere. This is
purely a display computation — `it.status` in the JSON is never overwritten, so the
override disappears the moment a check gets unmarked, no data loss, nothing to revert
by hand.

Security rules (Firebase console → Firestore → Rules, not stored in this repo) gate
writes to the authorized email per collection, e.g.:

```
match /tarboroLife/testedResources {
  allow read: if true;
  allow write: if request.auth != null
               && request.auth.token.email == 'cbleo73@gmail.com'
               && request.resource.data.keys().hasOnly(['tested', 'bugged', 'na'])
               && request.resource.data.tested is map
               && (!('bugged' in request.resource.data) || request.resource.data.bugged is map)
               && (!('na' in request.resource.data) || request.resource.data.na is map);
}
```
(mirrored for `coaVamp/testedResources`).

**⚠ ACTION NEEDED for `na` to actually work:** the same gotcha that hit `bugged` on
2026-08-13 (see below) is guaranteed to hit `na` too, on both collections, until the
owner manually republishes the rule above (with `'na'` added to `hasOnly`) in the
Firebase console — this can't be done from a Claude Code Remote session, same as
`wrangler deploy`. Until that happens, every click on an N/A checkbox will look like it
takes (optimistic UI) and then silently revert with a permission-denied error in the
console and "⚠ sync failed" in the sync-status line — checkboxes visibly clickable but
not actually saving, same symptom as the original `bugged` gotcha.

**Resolved 2026-08-13:** the rule above (`hasOnly(['tested', 'bugged'])` at the time,
before `na` existed) was missing from the live Firebase console rules for a while after
the `bugged` field shipped in the HTML/JS — both collections still had the old
`hasOnly(['tested'])`, so every write to a `bugged.*` field failed with
permission-denied (same "looks like a broken feature but the code is fine" gotcha
already documented below for Staff Applications' missing `create` rule). The owner has
since published the updated rule for both `tarboroLife/testedResources` and
`coaVamp/testedResources`, and both trackers' tested/bugged checkboxes were confirmed
working end-to-end — until `na` shipped and reopened the same gap (see the action item
above). If a fourth field like this is ever added, remember its rule needs `hasOnly` to
list every top-level field the client actually writes, not just the original ones.

**Auth method: email/password, not Google Sign-In.** Google Sign-In was tried first
(both popup and redirect flow) and reliably failed across Brave and Edge — the OAuth
consent screen completed every time, but the result never made it back to the app.
Root cause was almost certainly Chromium's third-party storage partitioning breaking
the handoff through the Firebase authDomain (`tarborolifebackend.firebaseapp.com`), a
different origin than the site. **Do not re-introduce Google Sign-In** without solving
that cross-origin problem first (e.g. a custom authDomain matching the site's own
domain) — email/password sidesteps it entirely (no popup, no redirect, no cross-domain
handoff) and is what's live now.

## Staff Applications form (`apply.html`)

A third Firebase-backed feature, same project, different collection:
`staffApplications`. Public submission form (Discord username, position(s),
experience, why-join, availability) plus an owner-only viewer of what's come in — the
**inverse** of the trackers' access pattern (trackers: public-read/owner-write;
this form: public-*create*/owner-read).

Firestore rule required (add as its own `match` block alongside the tracker rules —
**do not replace them**):

```
match /staffApplications/{appId} {
  allow create: if true;
  allow read, delete: if request.auth != null && request.auth.token.email == 'cbleo73@gmail.com';
  allow update: if false;
}
```

If submissions silently fail (status shows "Something went wrong submitting that"),
check this rule is actually published — Firestore denies by default, so a missing
`create` rule for this collection looks exactly like a broken form even though the
code is fine.

The owner-only viewer's cards each have **Accept** / **Delete** buttons. Accept
*moves* the doc (copy into `acceptedApplications` with an added `acceptedAt`
timestamp, then delete from `staffApplications`) rather than just flagging it in
place — so a pending application disappears from Pending and shows up in Accepted in
the same action, never both at once. Delete just removes it outright (with a
`confirm()` prompt first, since it's irreversible). The Accepted list renders above
Pending, directly below the sign-in/out row, with its own **Remove** button per card.
`acceptedApplications` is entirely owner-only (unlike `staffApplications`, nothing
public writes here) — needs its own rule:

```
match /acceptedApplications/{appId} {
  allow read, create, delete: if request.auth != null && request.auth.token.email == 'cbleo73@gmail.com';
  allow update: if false;
}
```

#### Applicant email confirmation

The form has an **email** field and an opt-in **"Email me a copy of my answers"**
checkbox. If checked, the client `fetch()`s `POST /api/send-application-confirmation`
after the Firestore write succeeds — this is the one route `worker.js` intercepts
before falling through to static assets (see the Deployment section above). That
route calls the **Resend** API server-side to actually send the mail; the applicant's
address never touches Resend from the client, and the API key never reaches the
browser.

Two pieces of config this needs, **neither of which lives in this repo**:
- `RESEND_API_KEY` — a Worker **secret** (`wrangler secret put RESEND_API_KEY`, or set
  via the Cloudflare dashboard → this worker → Settings → Variables and Secrets).
  Cannot be set from a Claude Code Remote session against this repo, same
  `api.cloudflare.com` block as `wrangler deploy` above — has to be done by the owner,
  from their own machine or the dashboard.
- `APPLY_FROM_EMAIL` — a plain (non-secret) var, already set in `wrangler.jsonc`'s
  `vars` block to `noreply@cb8eats.com`.

`noreply@cb8eats.com` must be a **Resend-verified sending domain** (Resend →
Domains → Add Domain → add the SPF/DKIM records it gives you into Cloudflare DNS) —
without verification, Resend can only deliver to the email on the Resend account
itself, not to arbitrary applicants. Inbound (receiving mail sent *to*
`noreply@cb8eats.com`, e.g. if someone replies) is a separate concern, handled via
Cloudflare Email Routing forwarding it to the owner's personal inbox — not something
Resend does. **If both Resend and Cloudflare Email Routing try to manage the
domain's SPF TXT record, they need to be merged into one record, not two** — a
domain can only have a single SPF TXT record; two will break deliverability for
both sending and routing.

The confirmation email failing is treated as a courtesy failure, not an application
failure — the success message still shows even if the email send fails, just with an
appended note. Don't change that coupling; a flaky Resend call should never make an
applicant think their application didn't go through.

## COA Bug Reports (`coa-bug-report.html`)

Same pattern as Staff Applications, adapted for bug reports instead of job
applications — public submission form (Discord username, title, severity, description,
steps to reproduce, optional screenshot/video link), owner-only viewer with per-report
triage actions. Linked from `coa.html`'s card grid ("Report a Bug").

- Public-create collection: `coaBugReports` — the open queue.
- Owner-only collection: `coaBugReportsResolved` — **Resolve** (labeled that instead
  of "Accept") moves a doc here the same way Accept does on Staff Applications: copy +
  stamp `resolvedAt`, then delete the original. **Delete** removes an open report
  outright (`confirm()` first). Resolved reports get their own **Remove** button.
- Severity is one of `critical` / `high` / `medium` / `low`, rendered as a colored
  chip (red/orange/yellow/green) on each card — reuses the same red-orange-yellow-green
  vocabulary as the resource trackers' crit/warn/good statuses.
- No email-confirmation step for this one (unlike Staff Applications) — reporters
  aren't asked for an email, only a Discord username, since follow-up happens there.

Firestore rules required (add alongside all the others, same Firebase project):

```
match /coaBugReports/{reportId} {
  allow create: if true;
  allow read, delete: if request.auth != null && request.auth.token.email == 'cbleo73@gmail.com';
  allow update: if false;
}

match /coaBugReportsResolved/{reportId} {
  allow read, create, delete: if request.auth != null && request.auth.token.email == 'cbleo73@gmail.com';
  allow update: if false;
}
```

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

## Warframe page (`warframe.html`)

A phone-first page for CB's Warframe account, built in the same JSON-driven +
Firebase style as the trackers. Four tabs: **Goals** (Mother Token farm counter and a
checklist of grind goals, with "Buy with plat" and "Foundry" filters), **Mods**
(Owned / Missing lists, search, and a "Buy with plat" filter on Missing), **Builds**,
and **Theme**.

- **Content is data:** `warframe-data.json` (fetched with `cache: 'no-store'`). Shape:
  `{ updated, updatedLabel, source, caveat, meta, farm{..., customFixes{}}, mods{owned[],
  missing[]}, builds[], resources[{group, items[]}] }`. Mod entries are strings or `{ "t": name, "tags": ["plat"] }`. Goals live
  in `farm.tasks` (each has `id`, `group`, `text`, `note`, `tags`, optional
  `doneDefault`, optional `parts`, see below). **CB's standing request: whenever his Warframe mod list changes
  (a scan, a new mod, a mod ranked up), replace this JSON and push so the page shows
  the correct list.**
- **A goal made of several things is a dropdown (`parts`), added 2026-10-09.** CB's rule:
  anything on the Goals tab that includes more than one thing (Own every Warframe, Own all
  the Primed mods, Own all the Archon mods, the Mother Token shop picks, the AX-52 parts)
  is a dropdown, and **nothing is listed twice**. A goal gets `parts: [{id, text, note?,
  doneDefault?, parts?}]`, nested as deep as needed (Primed mods holds one dropdown per
  weapon type). The row shows `done / total` and opens on tap; it has **no tick of its
  own** (it counts as done when every part is, so old `done.<parentId>` values in Firestore
  are ignored). Each part is an ordinary tick saved as `done.<id>`, so ids must be unique
  across the whole tree and only letters, digits, `-` and `_` (the page drops a repeated id
  or a repeated name with a console warning, `cleanGoals()`). Keep a part's old id when
  folding a loose goal into a dropdown, so its saved tick survives. Filters
  (Buy with plat / Foundry) read the top-level goal's `tags` only; put the tag on the
  dropdown, not on every part. **Own every Warframe** (updated 2026-10-09) holds four things:
  `frames-base` (66 base frames), `frames-prime` (the 52 Prime versions), `frame-excalibur-umbra` (a plain
  tick) and `frames-mechs` (the Necramechs Voidrig and Bonewidow). Not listed: Helminth (not a frame),
  and the twin frame "Sirius & Orion" appears once although the item database lists it twice. Source:
  WFCD `warframe-items` `Warframes.json`, current to 23 Sep 2026 (Narin); a new frame is `frame-<slug>`
  (`frame-<slug>-prime` for its Prime), kept A to Z. **`doneDefault: true` on a part means "ticked until
  CB changes it"** (his saved `done.<id>` wins, and unticking writes an explicit false); it is how owned
  things get pre-ticked from a scan, because Claude cannot write to Firestore. The frames were scanned
  from the in-game Arsenal (Swap list) on 9 Oct 2026: 34 owned and pre-ticked (24 base, 9 Prime, Excalibur
  Umbra), no Necramech yet. Rescan by reading that list again; the unowned ones sit after the owned ones and
  show a platinum price. Also in Collection:
  **Own all the Necramech mods** (`allnecra`, 28 from `Mods.json` where `compatName` is Necramech; the 9
  from the 8 Oct scan start ticked) and **Own all the Umbral mods** (`allumbral`, 3, all ticked). Keep the
  ticked ones in step with `/topics/warframe-mods.md` when the mod list is rescanned.
  The Mods tab already has dropdowns per group (`details.grp`).
- **View mod screen (added 2026-10-09):** tap any mod chip on the Mods tab, or a mod in a
  saved build, and a `<dialog id="wf-moddlg">` shows its stats: polarity, max rank, drain (or
  capacity gained, for auras and stances, whose `baseDrain` is negative), drain in a
  matching-polarity slot (half, rounded up; capacity doubles), a rank slider with the stat
  lines at that rank (starts at max rank), an "Every rank" table, what the list says about it
  (copies, best rank, or the `note` for a missing mod), set partners, a wiki link, and the mod
  picture. A chip that stands for a family (`Bane of Corpus/Grineer/Infested`, `Bond family: ...`)
  opens a screen with one button per member. Chips with no match stay plain text.
  - **Data:** `warframe-mod-stats.json`, fetched with `cache: 'no-store'` *after* the main data
    (`loadModStats()`); if it fails the chips stay plain and the page logs one `console.warn`.
    Shape: `{ built, source, usage: { players, builds, min, label, updated }, mods: { m0: { n name,
    p polarity, r rarity, d baseDrain, m max rank,
    c compat, t type, l [[stat lines] per rank 0..m], xr extra ranks the database lists beyond
    max (some Railjack mods), ds description, set, sp set partners, tr tradable, ex exilus, ut utility
    (also fits an Exilus slot), intro, w wiki url, img picture file, u [different players, builds] from the community tally } },
    index: { "<groupId>|<chip name>": [mod keys] },
    partial: { "<groupId>|<chip name>": [names the database lacks] },
    arcanes: { Warframe: [names], Primary: [...], Secondary: [...], Melee: [...] } }`. `arcanes` feeds the Add build
    form's arcane dropdowns; refresh it with `--arcanes <folder>/Arcanes.json` (same repo as Mods.json),
    otherwise the generator keeps the ones already in the file. The chip name is
    what `parseChip()` returns; builds use group id `builds`.
  - **It is generated, not hand-edited:** `python3 tools/build-mod-stats.py --items <Mods.json>`
    reads `warframe-data.json` and WFCD's `warframe-items` `Mods.json` (npm `warframe-items`,
    `data/json/Mods.json`) and rewrites the file. **Re-run it whenever the owned or missing mod
    lists change** (a new chip with no entry in `index` is simply not tappable), then commit both
    files. It prints chips it could not match and the judgement calls it made. The database
    has several mods of one name (Flawed/Intermediate/Expert copies); the script prefers the
    one for that group's kind of mod, then the normal (non-tier) copy, then the one with real
    text. Stat text is cleaned of the game's markup tags.
  - **Pictures** are the 256px mod artwork from the same repo, loaded straight from
    `https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/img/<file>` by the browser
    (not copied into this repo); if one fails to load it is hidden and nothing else changes.
    The sandbox cannot reach jsDelivr (use `raw.githubusercontent.com` there).
  - The data file is one of the dev-only data files (see the Dev hub section), so it is in
    `DEV_DATA` in `worker.js` and in `wrangler.jsonc`'s `run_worker_first`.
- **"Most used by the Community" filter (added 2026-10-09):** a button on the Mods tab (`#mf-comm`),
  in both the Owned and the Missing view, that keeps only the mods enough *different players* use
  and puts the most used first, with the number on each chip (`c.used`, "24 players"). It works
  together with Buy with plat. `ui.community` (true/false) is saved in the same localStorage entry
  as the other filters; if `warframe-mod-stats.json` has no `usage` (file missing or old) the button
  is greyed out and nothing is filtered. A family chip uses its most used member's number. The View
  mod screen also gets a "Community use" box ("N different players use this mod, in M builds").
  - **How it is counted (CB's rule: count how many different people use the same mod, don't rely on
    another site's number):** `tools/mod-usage.json` is **our own tally**, one record per build that
    has been read, keyed `<source>:<id>` (so a build is never counted twice) with the player who made it
    (`by`), a category and the mods. A mod's popularity is the number of **different players** (`by`,
    ignoring case) whose builds use it, so one player posting dozens of near-identical builds counts
    once; the number of builds is kept alongside. "Most used" means at least `min_players()` players:
    3% of all players counted, never fewer than 3 (5 with the first 160 players). The tally is seeded
    (2026-10-09) with Overframe's top 100 builds in each of its six categories: 600 builds by 160
    players (one player alone made 201 of them, which is exactly why players are counted, not
    builds). The sample is the highest-rated builds, so it leans towards older, popular items, and
    the names are matched to the database by name (628 of 634 match; the rest are augment or
    Railjack variants).
  - **STANDING RULE (CB, 2026-10-09): any time you read a build, tally it.** That means a build from
    Overframe or anywhere else, or one of CB's own in-game builds (read it off the screen, `--source
    ingame`). One command per build, then regenerate and commit both files:
    `python3 tools/mod_usage.py add --source overframe --id <id> --by <player> --cat <category>
    --frames "Zephyr" --mods "A, B, C"` (add `--items <Mods.json>` to catch misspelt names; it refuses
    a build that is already in the tally), then `python3 tools/build-mod-stats.py --items <Mods.json>`.
    `python3 tools/mod_usage.py report` prints the totals, the top mods and which players made the
    most builds. Never edit counts by hand.
  - **Also note which frames each build is on (CB, 2026-10-09: "sometimes that plays into it").** A
    tally record may carry `frames: ["Zephyr", ...]`: the Warframes the build is made for or leans
    on. A frame build is on its own frame; a Necramech build is `Voidrig`/`Bonewidow`; for a weapon,
    archwing or companion build it is the frame(s) the author pairs it with. Base names only (`Mesa`,
    not `Mesa Prime`; `Excalibur Umbra` stays separate). Overframe has **no frame field**: it is only
    in the title (titles like "Harrow's Arsenal | ...") and the free-text `description` of
    `/api/v1/builds/<id>/`, so read those. Pass `--frames` to `add` (use `--replace` to add it to a
    build already tallied). Frames never change a mod's count; they are context. The 600 seeded
    builds were filled in on 2026-10-09: the 30 on the Builds tab by hand from the write-ups, the
    rest by a scan (a frame counts when the title names it or the write-up mentions it 3+ times; a
    frame build gets its own frame from the build URL's item slug); expect a few misses and odd
    pairings in those, and read the write-up before trusting one. `report` shows which frames are named most.
  - **How the seed was read (Overframe is client-rendered, so a plain fetch gets nothing):** in the
    built-in browser on `overframe.gg`, `GET /api/v1/builds/<id>/` (same origin) returns `author.username`,
    `title`, `item`, `score`, `formas`, `item_rank` and `slots[]` (`slot_id`, `mod`, `rank`); the top 100
    build ids per category are the `a[href*="/build/<id>/"]` links on `/builds/<category>/`
    (`warframes`, `primary-weapons`, `secondary-weapons`, `melee-weapons`, `archwing`, `sentinels`).
    Overframe mod ids have no name in the API: the names come from the rendered item list at
    `/items/mods/?page=N-0`, and a few ids missing from it were read off the build page. Slots whose id is
    an arcane are left out of the tally.
  - The generator prints the popular mods that are on **neither** the Owned nor the Missing list
    (29 in the first run, e.g. Gladiator Might, Venomous Clip, Hunter Munitions): the filter can only
    show mods the lists contain, so tell CB when that list is long. **On 2026-10-10 CB said to add all
    29 to Missing** (a new Missing group `m-archwing`, "Archwing and Arch-Melee", plus the rest filed under
    their weapon group; all tagged `plat`), so the list is 0 now. When a rescan or a bigger tally makes it
    non-empty again, ask CB and do the same.
  - `tools/` is in `.assetsignore`, so the scripts and the tally (other players' usernames) are not
    published with the site.
- **Community builds on the Builds tab (added 2026-10-09; CB: "have some of these builds on the website
  for viewing"):** the Builds tab has a **My builds / Community builds** switch (`#bv-mine`,
  `#bv-community`; `ui.builds` and `ui.bcat` are saved in the same localStorage entry as the other
  filters). Community builds shows cards from `warframe-community-builds.json`, with category buttons
  (Warframes, Primary, Secondary, Melee, Archwing, Companions) and for each build: item, title, "by
  <player> · Overframe score N · F forma · rank R · updated D", a **Frame(s)** row with a one-line
  note when the author names a frame (see the standing rule above; a Warframe build needs no row, it
  is on its own frame), the mods with their ranks, the arcanes, "On your lists: A owned, B missing, C
  on neither", and an "Open on Overframe" link. A mod the Missing list has is drawn dashed; a max-rank
  mod has the usual `max` marker; tapping a mod opens the View mod screen **at the rank the build
  uses**, with an "In this community build" box. If the file is missing the button is greyed out
  and My builds shows (one `console.warn`).
  - **Data:** `warframe-community-builds.json`, fetched with `cache: 'no-store'` (`loadCommunity()`),
    `{ built, source, note, cats: [[id, label]], builds: [{ id, cat, item, title, by, score, formas,
    rank, updated, frames?, frameNote?, mods: [[name, rank]], arcanes: [[name, rank]] }] }`. 30 builds today,
    the top 5 per category (one per item, at most two per player). The category id for companions is
    `companions` (Overframe calls it `sentinels`). **Every build in it is also in `tools/mod-usage.json`**
    (same id, same player), so the tally and the page agree.
  - **To add or refresh builds:** read them the way the seed was read (see above), put them in the file,
    tally them (`mod_usage.py add`, with frames), then run `python3 tools/build-mod-stats.py --items
    <Mods.json>`, which also reads this file (`--community`, default
    `warframe-community-builds.json`) and gives its mod chips group id `community` in
    `warframe-mod-stats.json` so they are tappable. Commit all three files.
  - It is a dev-only data file like the others: in `DEV_DATA` in `worker.js` and in
    `wrangler.jsonc`'s `run_worker_first`; the worker 404s it on every host except the dev one.
- **The `plat` tag** means "tradable according to the warframe-items database
  (about March 2025)", not a live price. Items missing from that database are untagged.
- **Mother Token counter (changed 2026-10-10; CB: "3 tiers ... 10, 15, 20" and "a custom amount"):** the
  Goals tab's top card counts **tokens**, not runs. Three buttons add a Tier 1 / 2 / 3 Isolation Vault
  (`farm.tiers` in `warframe-data.json`: `{id, label, tokens}` = 10, 15, 20) plus `farm.vaultBonus` (7) when
  the "I opened the vault" box is ticked (saved per device in the localStorage `ui` entry as `bonus`, on by
  default). So a Tier 3 run is 27, which is what the old `perRun: 27` was. **The 7 bonus is CB's guess** ("idk
  that tho"; the wiki's Isolation Vault page says opening the vault gives an extra drop-table reward, not a
  token count), so the page says so. A fourth button, **Custom**, opens a number box beside Add / Cancel: a
  whole number adds, a minus takes off (spending at the shop), and the total never goes below 0. **Undo**
  reverses the last add (in memory only). The old `perRun`, `runsNeeded` and `runLabel` fields are gone from
  the JSON; `target`, `picks`, `pickCosts` and `shopRefresh` stay and are still edited by hand.
  **Storage trick:** the total is saved in the existing Firestore field `runs` (an int, written with
  `updateDoc({runs: n})`), so **no Firestore rule change is needed**. It held a run count (it was 0 when this
  shipped, so nothing was converted); in the code it is `S.tokens`. Do not add a separate `tokens` field
  without asking CB to republish the rule with it in `hasOnly`. A page cached from before this change would
  read the token total as a run count until it reloads.
- **Add build (Builds tab, added 2026-10-10; CB: "10 drop downs plus aura slot, exilus and adapter"):** under
  the My builds / Community builds switch, a **+ Add build** button (`#bv-add`, owner only, greyed until
  `warframe-mod-stats.json` has loaded) opens a form (`#wf-bdlg`): build name, what it is for (Warframe,
  Primary, Secondary, Melee, Archwing, Arch-Gun, Arch-Melee, Companion, Necramech; `BUILD_CATS` in
  `warframe.html`), an optional item name, **10 mod dropdowns** (`wf-b-m0`..`wf-b-m9`), an **Aura** dropdown
  (a **Stance** one for melee), an **Exilus** dropdown (only mods flagged `ex` or `ut`; shown for a Warframe and
  for Primary, Secondary and Melee weapons, the ones that take an Exilus adapter, hidden for the rest) and the
  **arcane dropdowns** (`arcaneSlots` in `BUILD_CATS`; "adapter" in CB's first message was read as the arcane
  slot a weapon gets from an Arcane Adapter). **CB, 2026-10-10: "the 2 arcanes for warframes, the one for the
  weapons"**, so a Warframe has **Arcane 1 and Arcane 2** (`wf-b-arcane`, `wf-b-arcane2`, both the Warframe
  arcanes, and the same arcane cannot be in both), Primary, Secondary and Melee have one **Arcane**, and an
  **Arch-Gun** has two (the wiki: the top slot takes a Primary arcane, the bottom a Secondary one). Archwing,
  Arch-Melee, Companion and Necramech have none (the wiki says robotic companions cannot equip arcanes), plus
  notes. The Exilus lists were checked against the wiki's Exilus Mods category on 2026-10-10: nothing the wiki
  lists was missing, and the only extras are five the database flags (Hushed Invisibility, Intruder, Shock
  Absorbers, Overview, Primed Shotgun Ammo Mutation). Each dropdown offers that category's mods from `warframe-mod-stats.json`, grouped
  "You own" / "You are missing" / "Not on either list" (so a mod that is on neither of the lists can still be
  picked), A to Z, each name once. A build cannot use one mod twice (the form says which slots clash). Changing
  the category keeps the choices that still fit and clears the rest.
  - **Storage, no rule change:** each build is `warframe/progress.custom.<id>` with `kind: 'build'` (id
    `b` + time + random), value `{ kind, name, cat, item, config, aura, auraRank, exilus, exilusRank, arcane, arcaneRank,
    arcane2, arcane2Rank, mods: [10 names, '' for an empty slot], ranks: [10 ranks, null when not known], notes, at }`
    (`arcane2` is the second Warframe or Arch-Gun arcane; builds saved before it existed just have `arcane`; builds
    saved before ranks and config existed have none of the new keys and load as "Rank ?"). `cleanBuild()` is the one
    place that reads a saved build. It shares the `custom` map with the added goals, so `customTasks()` skips anything with
    `kind === 'build'` and the goal list never shows them; `userBuilds()` reads the other way. The rule's
    `custom.size() <= 200` limit is shared. Mods are saved by **name**, not by `m123` key (the keys change every
    time the generator runs); an edit keeps a saved mod the list no longer has, labelled "(not in the list now)".
  - **Cards** (`.build.mine`, `data-build` = id; the builds you added oldest first, then the ones that come with
    the page): category pill, name, Edit button, item and config, aura/stance, Exilus, the mods (tap one for the View
    mod screen; dashed = on your Missing list), the arcanes, "On your lists" counts and the notes. Edit has a
    two-tap Delete like the goal form. Writes are optimistic and roll back with the usual "server refused" message.
    `renderLive()` also redraws the builds, so a change from another device shows up.
  - **Ranks and config (added 2026-10-10; CB: "make my builds editable"):** every slot (aura/stance, Exilus, the
    10 mods, the arcanes) has a small **rank dropdown** on the label row (`wf-b-m0-r` etc., class `rk`): "Rank ?"
    (not known, saved as `null`), then 0 to the mod's max rank (`modMax(name)`, the biggest `m` among the mods of
    that name in `warframe-mod-stats.json`; an arcane offers 0 to 5, since most arcanes stop there). A newly
    picked mod starts at its **max rank**, an arcane on "Rank ?"; a build saved with no rank stays unknown until
    CB changes it (saving never turns "?" into max). A slot with no mod has no rank dropdown. **Config** is a
    dropdown (not set, Config A, B, C; an older free-text value stays on offer). The card shows `r7/10` on each
    chip (`max` styling at the top rank) and tapping a chip opens the View mod screen **at that rank**, with an
    "In your build" box saying so. Notes now hold up to 500 characters.
  - **The hand-kept builds are editable too (Burston Prime, Cyte-09 Config A, Config B).** In `warframe-data.json`
    each entry of `builds[]` is `{ id, name, goal?, status?, form: { cat, item, config, aura, auraRank?, exilus,
    mods: [10 names], ranks: [10 ranks or null], arcane?, arcaneRank?, arcane2?, arcane2Rank?, notes }, stats?,
    statsNote?, slots?, notes? (the "What we learned" bullets), next? }`. `form` has the same shape as a saved
    build; the rest are extras the form cannot hold and are always shown under the card (they are not editable on
    the page). `seedBuilds()` draws them: if `custom.<id>` holds a saved build it **wins over `form`** (the first
    Edit + Save writes it), otherwise `form` is shown. **Delete** on one writes `custom.<id> = { kind: 'build',
    hidden: true }` (the page cannot edit the file) and the card disappears; the same id can never be re-added
    from the page, so to bring one back Claude changes the id in the JSON. Anything already saved under a seed id
    is skipped by `userBuilds()`. **To add a build to the file:** write its `form` (mods in slot order, `null` for a
    rank not known, ranks read from the in-game pips and drain as in the Cyte-09 reading) and give it a short
    unique `id` (letters, digits, `-`, `_`); `tools/build-mod-stats.py` reads `form` (aura, exilus, mods) as well as
    the old `mods` so the chips are tappable, so **re-run it** and commit the regenerated stats. Config A is
    `cyte-a`, read from the game on 2026-10-10 (Worthy Comradery r5, Energy Nexus r2, Equilibrium r7, Narrow Minded
    r10, Fast Deflection r5, Transient Fortitude r8, Archon Continuity r10, Adaptation r6, Blind Rage r5; the
    Exilus slot is locked; capacity 1 of 74 left).
- **Sync:** Firestore doc `warframe/progress` = `{ done: {goalId: bool}, runs: int (the Mother Tokens counted, see above),
  theme: {...}, custom: {goalId: {name, qty, plat, at}} }`. Public read, owner-only write (`cbleo73@gmail.com`, email/password
  sign-in is the shared header button, `js/dev-auth.js`). Writes use `updateDoc` with dotted paths; `setDoc` is only
  the fallback when the doc does not exist yet. If Firebase fails to load, the page
  still renders from the JSON. Rule needed (add alongside the others, **do not replace
  them**; it must be published by the owner in the Firebase console):

```
match /warframe/progress {
  allow read: if true;
  allow write: if request.auth != null
               && request.auth.token.email == 'cbleo73@gmail.com'
               && request.resource.data.keys().hasOnly(['done', 'runs', 'theme', 'custom'])
               && (!('done' in request.resource.data) || request.resource.data.done is map)
               && (!('runs' in request.resource.data) || request.resource.data.runs is int)
               && (!('theme' in request.resource.data) || request.resource.data.theme is map)
               && (!('custom' in request.resource.data)
                   || (request.resource.data.custom is map && request.resource.data.custom.size() <= 200));
}
```

**⚠ Same gotcha as the trackers:** `hasOnly` must list every top-level field the page
writes. `custom` was added after the first version of this rule, so if the owner
published the original three-field rule, adding goals fails with permission-denied
(the page says "The server refused that write") until the rule above is republished.

- **Added goals (the "+ Add goal" button, owner only):** opens a form with a resource
  dropdown (built from `resources` in `warframe-data.json`, grouped; plus an "Other"
  option for anything missing), a quantity goal and a row of **tag buttons** (see the
  tag list below). Each goal is stored
  as `custom.<id>` where `<id>` is generated (`c` + time + random, letters and digits
  only, because it becomes a dotted Firestore field path). They render under the
  "Added by you" group, can be ticked off like any goal (`done.<id>`), and the owner can
  edit or delete them (delete removes both `custom.<id>` and `done.<id>`).
  - **Reading them as Claude:** `warframe/progress` is public-read, so
    `https://firestore.googleapis.com/v1/projects/tarborolifebackend/databases/(default)/documents/warframe/progress`
    returns them. The Claude Code Remote sandbox cannot reach `firestore.googleapis.com`
    (egress policy), so read it from the owner's browser (a `fetch` from a page on the
    site, through the built-in browser) or ask the owner to paste what the page shows.
  - **Correcting them as Claude:** Claude cannot write to Firestore (that needs the
    owner's email/password sign-in, which Claude must not type). Instead,
    `farm.customFixes` in `warframe-data.json` overrides what is stored:
    `{ "<id>": { "name": "Nitain Extract", "qty": 60, "plat": true } }`, or
    `{ "<id>": { "hidden": true } }` to hide a goal. Only the keys present are
    overridden. The owner can still edit or delete the goal in the page; if a fix exists
    for it, the page warns that the fix still wins until Claude removes it. A fix may
    also set `"tags": ["plat", "foundry"]` (unknown ids are dropped) instead of `plat`.
  - **Tags (added 2026-10-09):** the tags live in one list, `TAGS` in `warframe.html`
    (`{ id, label, tone, explain }`; today `plat` = Buy with plat and `foundry` =
    Foundry). That list drives everything: the filter buttons above the goals, the
    chip on a goal, the sentence under a filter, and the tag buttons in the Add goal
    form. **To add a tag, add one line to `TAGS`** (`tone` is `accent`, `accent2` or
    `bright`, which picks the colour) and put its id in a goal's `tags` in
    `warframe-data.json`. A tag button is lit in its own tag colour when on and greyed
    when off (`aria-pressed`). A custom goal saves `custom.<id>.tags` (array of ids)
    and still also writes the old `plat` flag, so a cached older page keeps reading it
    right; goals saved before tags existed (only `plat`) are read as `tags: ['plat']`.
    No Firestore rule change is needed, because `custom` is a map and its inner fields
    are not constrained.

- **Theme:** the Theme tab is the shared editor from `js/theme.js` (see the Dev hub
  section) — the same four colors drive the hub and both trackers too.
- **Address:** reached from the third card on the Dev hub (`warframe.html` -> `/warframe`).
  The old `warframe.cb8eats.com` / `www.warframe.cb8eats.com` hostnames were replaced by
  the dev hostnames below, and the Worker no longer rewrites them (if they are still
  attached in the dashboard, they just show the home page).

## Dev hub (`dev.html`) and the dev pages

The Tarboro Life tracker, the COA tracker and Warframe are owner/dev tools, not public
content. They live together under one hub page with three big cards (`dev.html`; ids
`hub-tarboro`, `hub-coa`, `hub-warframe`). **Four dev pages:** `dev.html`,
`tracker.html`, `coa-tracker.html`, `warframe.html`.

- **Address:** `www.dev.cb8eats.com` (and `dev.cb8eats.com`) shows the hub at its bare
  root, and `/dev` works on every hostname. `worker.js` checks
  `DEV_HOSTS.has(url.hostname)` and `pathname === '/'` (GET/HEAD only; `/` only reaches
  the Worker because of `assets.run_worker_first: ["/"]`) and fetches `/dev` from
  `env.ASSETS` (extensionless on purpose: `/dev.html` 307-redirects to `/dev`). Every
  other path on that host falls through to the normal assets, so relative `css/`, `js/`
  and JSON links work. The hostname is attached in the Cloudflare dashboard (Workers &
  Pages -> `cb8eatswebsite` -> Settings -> Domains & Routes -> Add -> Custom domain),
  **not** in `wrangler.jsonc`, and cannot be done from a Claude Code Remote session —
  the owner does it. Auth persistence is per origin, so signing in on
  `www.dev.cb8eats.com` and on `www.iltep.cb8eats.com` are separate sign-ins. If
  sign-in fails only on a new hostname, check Firebase console -> Authentication ->
  Settings -> Authorized domains and the web API key's website restrictions in Google
  Cloud.
- **The lock: Cloudflare Access on the dev hostname, and dev pages only exist there.**
  `worker.js` serves `/dev`, `/tracker`, `/coa-tracker`, `/warframe` (and their `.html`
  forms) and the data files `resource-inventory.json`, `coa-inventory.json`,
  `warframe-data.json`, `warframe-mod-stats.json`, `warframe-community-builds.json` ONLY on `DEV_HOSTS`. On any other hostname (the public site, the
  `workers.dev` address) the pages 302 to `https://www.dev.cb8eats.com/...` and the data
  files 404, so nothing dev-related can be read from the public hostname. Variants like
  `/%64ev`, `//tracker`, `/Tracker` are normalized in the Worker or answered by the asset
  layer with a 307 to the canonical path, which then hits the Worker (tested on the real
  workerd). The wall itself is a **Cloudflare Access self-hosted application** for
  `www.dev.cb8eats.com`, created in the dashboard (Zero Trust -> Access -> Applications),
  with an Allow policy listing the emails that may enter; people get a one-time code by
  email. **Only the owner's Cloudflare login can edit that list, which is the only way
  devs are added or removed** (CB chose this over an in-site panel, which would need a
  Cloudflare API key stored on the site). Other devs are therefore view-only: they get no
  Firebase account, so only the owner can check things off or change the theme. Access
  cannot be created from a Claude Code Remote session (api.cloudflare.com is blocked).
  **Not built yet (planned follow-up, needs the team domain and the application's AUD tag
  from CB):** the Worker verifying the `Cf-Access-Jwt-Assertion` header on the dev hosts
  as a second lock in case the Access app is ever removed or misconfigured. Put its two
  values in `wrangler.jsonc` `vars` (dashboard-set vars get overwritten on deploy).
  **Known gap:** the tracker check-states and `warframe/progress` live in Firestore, which
  is public-read, so Access does not cover them (the page content and data files are
  covered). Closing that means Firestore rules that require sign-in, which would also
  stop view-only devs from seeing live states — a deliberate trade-off to revisit.
- **The Dev tab (`js/members-nav.js`, loaded on every public page):** appends a
  `Dev` tab (`li[data-members-tab]` -> `https://www.dev.cb8eats.com/`) to `header .nav-tabs`, but only when
  localStorage key `cb8eats-viewer-v1` holds `owner` or `dev`. That hint holds just the
  word, never an email. Pages with a sign-in call `window.cb8Members.setUser(user)` from
  their `onAuthStateChanged` (the dev pages through `dev-auth.js`, plus `apply.html` and
  `coa-bug-report.html`), which works out the role and writes or clears the hint.
  `OWNER` is `cbleo73@gmail.com`; **`DEVS` in that file is the list of other dev emails
  (lowercase)** — currently empty. Adding an email there only shows them the tab: they
  also need a Firebase email/password account, and any write access means changing the
  Firestore rules (which live in the Firebase console, not this repo). Public visitors
  never load Firebase for this.
- **The sign-in button (`js/dev-auth.js`, `css/cb8-auth.css`) — on EVERY page, public site
  included:** one button at the very top right of the header ("Sign in", or "Signed in"
  with a green dot), opening a small `<dialog>` with email/password; once signed in the
  dialog shows who is signed in and a Sign out button. It wraps the `<nav>` in
  `.cb8-header-right`. Normally it sits inline, right of the menu; when the menu drops to
  a second row (phones, narrow tablets) the script adds `.cb8-pin` to the header
  (re-checked on resize, font load and header size change) and the button is pinned to the
  header's top right corner with the menu on its own row below. **Dev pages** load
  Firebase right away (`<script src="js/dev-auth.js" defer>`); **public pages** use
  `<script src="js/dev-auth.js" defer data-lazy>` so Firebase Auth is NOT downloaded until
  the button is tapped, unless the browser already remembers an owner/dev sign-in (the
  `cb8eats-viewer-v1` hint). An ordinary visitor who never taps it loads nothing extra.
  Both `apply.html` and `coa-bug-report.html` also keep their own in-page sign-in for the
  owner viewer; the two share the same Firebase default app, so they stay in step. The
  script lazy-loads Firebase Auth with a dynamic `import()` and shares the page's default
  app via `getApps().length ? getApp() : initializeApp(CFG)` (`initializeApp` with
  identical options returns the existing default app, so the page's own module is
  unaffected). The old per-page sign-in forms on the trackers and Warframe were removed —
  **don't re-add them**. A new public page needs both tags: `css/cb8-auth.css` after
  `style.css`, and the two scripts (`members-nav.js`, then `dev-auth.js` with `data-lazy`).
  Claude must never type the password.
- **Shared theme (`js/theme.js`, loaded synchronously in `<head>` so there is no flash):**
  four base colors (forest green, royal purple, neon green, neon purple) -> every CSS
  variable (`--bg`, `--bg-alt`, `--card`, `--card-hover`, `--border`, `--border-soft`,
  `--accent`, `--accent-dim`, `--accent-bright`, `--accent-2`, `--glow`, `--wash-a/b`,
  `--on-accent`, `--on-grad`). Stored per device in localStorage
  `cb8eats-warframe-theme-v1` (same key the Warframe page always used, so earlier saved
  colors carried over) and, for the owner, in Firestore `warframe/progress.theme`. A
  device with no local theme follows the saved one, read through the public REST address
  `https://firestore.googleapis.com/v1/projects/tarborolifebackend/databases/(default)/documents/warframe/progress`
  (deliberately no API key, to avoid referrer restrictions); pages that already have a
  Firestore listener call `WFTheme.setRemote(theme)` from their `onSnapshot`. A `storage`
  listener makes open tabs follow a change live. `WFTheme.mountEditor(box, {canSave,
  save, onError})` builds the editor card; the hub and the Warframe Theme tab both use
  it, and the owner's edits save after a short delay (`updateDoc` with `setDoc` only as
  the `not-found` fallback; writes only the `theme` field, so `hasOnly` in the
  `warframe/progress` rule is unchanged).
- **Shared look:** `css/dev-base.css` (page background wash, header, nav pill, buttons,
  slim header at <=420px; load it after `css/cb8-auth.css`) is loaded by all four dev pages;
  `css/dev-widgets.css` (cards, inputs, toast, theme editor) only by the hub and
  Warframe, because the trackers define colliding class names. The trackers' `.res-inv`
  panel maps its own `--ri-*` variables onto the theme (`--ri-bg: var(--bg-alt)`,
  `--ri-accent: var(--accent)`, ...) so it follows the colors, but the status colors
  (crit/warn/good/verified/planned) stay fixed on purpose because they carry meaning.
  The trackers keep their own row layout; Warframe's lists were not rebuilt in it.
- **Icons (each dev page has its own, on purpose):** the Dev hub (`dev.html`) has a DEV
  icon (green D, purple E, green V on dark, from CB's saved theme colors `#00ff66` /
  `#e040ff`): `images/dev-icon.svg` (tab icon, rounded) and
  `images/dev-apple-touch-icon.png` (180x180, full-bleed square, for Safari's Add to Home
  Screen; also a PNG tab-icon fallback), with `apple-mobile-web-app-title` `DEV`. The
  Tarboro Life tracker keeps its `TL` tab icon (`favicon-tarboro.svg`) and the COA tracker
  its `COA` one (`favicon-coa.svg`); each also has a matching 180x180 home-screen PNG
  (`tl-apple-touch-icon.png`, `coa-apple-touch-icon.png`, rendered from those SVGs) and a
  home-screen title of `TL` / `COA`. Warframe and the whole public site keep the "CB"
  `favicon.svg` (no touch icon). The DEV letters are drawn as paths, so no font is needed.
  iOS caches the icon from when a shortcut was added, so changing it means removing and
  re-adding the shortcut. The hub's cards are titled `TL`, `COA` and `Warframe`, but the
  menu tabs in the dev pages' headers stay words ("Dev hub", "Tarboro tracker",
  "COA tracker", "Warframe"), because CB wants that.
- **Phone width:** long unbroken words in `.res-desc`/`.res-note` used to push the
  trackers wider than the screen; they now wrap (`overflow-wrap: anywhere`).

## Conventions

- One branch per change (`claude/<description>`), PR opened against `main`, squash
  merge. Git history is full of small, single-purpose PRs — keep following that
  pattern rather than batching unrelated changes.
- No build step, no package.json — just static files. `wrangler.jsonc` deploys the
  repo root as-is.
- GitHub Pages serving (if still enabled) is case-sensitive on file paths (Linux-based)
  — asset `src`/`href` capitalization must match the real filename exactly.
