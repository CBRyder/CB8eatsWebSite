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
- **The `plat` tag** means "tradable according to the warframe-items database
  (about March 2025)", not a live price. Items missing from that database are untagged.
- **Sync:** Firestore doc `warframe/progress` = `{ done: {goalId: bool}, runs: int,
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
  option for anything missing), a quantity goal and a "Buyable with plat" checkbox
  (which gives the goal the same Buy with plat tag the filter uses). Each goal is stored
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
    for it, the page warns that the fix still wins until Claude removes it.

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
  `warframe-data.json` ONLY on `DEV_HOSTS`. On any other hostname (the public site, the
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
