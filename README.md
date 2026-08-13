# CB8eats

My corner of the internet — game design, music, and server projects, all in one place.

**🔗 Live site: [www.iltep.cb8eats.com](https://www.iltep.cb8eats.com)**

## What's here

- 🎨 **[Designs](designs.html)** — design work and creative projects, visuals and ideas in progress.
- 🎵 **[Music](music.html)** — original tracks, Spotify embeds, and self-hosted audio.
- 🦇 **[COA: Vampire Knights](coa.html)** — an original game project, with dedicated pages for its
  [world](world.html), [factions](factions.html), and [story](story.html).
- 🏙️ **[Tarboro Life](tarboro-life.html)** — a custom FiveM roleplay server built around progression,
  ownership, and crafting, with pages covering its [jobs](jobs.html), [businesses & orgs](businesses.html),
  [gangs](gangs.html), and [activities](activities.html).

## Highlights

- **Two live, real-time testing trackers.** [Tarboro Life's Resource Inventory](tracker.html) and
  [COA's System Inventory](coa-tracker.html) are full audits of every server resource / game system,
  cross-checked against the real codebase — not just a static checklist. Every individual behavior can be
  marked **tested & working** or flagged **didn't work / bugged** (two distinct, color-coded checkboxes),
  synced live across every device via Firestore. Anyone can watch progress; only the owner can check things
  off.
- **Public intake forms with an owner-only review queue.** [Staff Applications](apply.html) for Tarboro Life
  and [Bug Reports](coa-bug-report.html) for COA both let anyone submit, while the owner gets a private
  dashboard to accept/resolve or delete — no third-party form tool required.
- **No build step.** Plain static HTML, CSS, and vanilla JS throughout — what you see in this repo is
  exactly what ships.

## Stack

- Static HTML/CSS/JS, hand-rolled dark theme design system (`css/style.css`)
- [Firebase](https://firebase.google.com/) (Firestore + Auth) powers the two live trackers and the
  application/bug-report intake forms
- Deployed on [Cloudflare Workers](https://workers.cloudflare.com/), auto-deploying on every push to `main`
