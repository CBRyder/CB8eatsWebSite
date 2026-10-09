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
  `doneDefault`). **CB's standing request: whenever his Warframe mod list changes
  (a scan, a new mod, a mod ranked up), replace this JSON and push so the page shows
  the correct list.**
- **The `plat` tag** means "tradable according to the warframe-items database
  (about March 2025)", not a live price. Items missing from that database are untagged.
- **Sync:** Firestore doc `warframe/progress` = `{ done: {goalId: bool}, runs: int,
  theme: {...}, custom: {goalId: {name, qty, plat, at}} }`. Public read, owner-only write (`cbleo73@gmail.com`, email/password
  sign-in inside the page). Writes use `updateDoc` with dotted paths; `setDoc` is only
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

- **Theme:** four base colors (forest green, royal purple, neon green, neon purple)
  drive every CSS variable on the page, computed by a small script in `<head>` before
  paint. Saved per device in `localStorage` (`cb8eats-warframe-theme-v1`); when the
  owner is signed in it also syncs to `warframe/progress.theme`.
- **Address:** served at `/warframe`. A `warframe.cb8eats.com` hostname is planned but
  **not wired up yet** (needs a hostname check in `worker.js` plus a custom domain in
  the Cloudflare dashboard).

## Conventions

- One branch per change (`claude/<description>`), PR opened against `main`, squash
  merge. Git history is full of small, single-purpose PRs — keep following that
  pattern rather than batching unrelated changes.
- No build step, no package.json — just static files. `wrangler.jsonc` deploys the
  repo root as-is.
- GitHub Pages serving (if still enabled) is case-sensitive on file paths (Linux-based)
  — asset `src`/`href` capitalization must match the real filename exactly.
