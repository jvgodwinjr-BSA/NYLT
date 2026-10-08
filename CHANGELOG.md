# Changelog

Notable changes to the Program Scheduler. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **124 Quartermaster tasks in the catalog**, tagged `qm` plus a category and a suggested SD, so the rail's search surfaces the QM work for a weekend. `npm run import-qm-tasks` converts `scripts/qm-tasks-source.json` into extras rows; `npm run import-catalog` folds them into the pack. The pack now holds 213 activities.
- Extras rows carry their own `source`, so a row's origin stays visible in `activities.csv`.
- **Task status and a Progress panel.** Staff tasks now carry `todo` / `doing` / `blocked` / `done` with a role and a timestamp, set from a one-tap dot in the left rail or from the block editor. A **Progress** tab shows how far ahead of pace the team is, a per-weekend breakdown, and what the next weekend still needs.
- Deadlines are derived, not maintained: a task's weekend tag resolves against `events.csv`. `before-sdN` is due when that weekend starts, `sdN` when it ends, and `post-course` has no deadline rather than a fabricated one — so finishing undated work early cannot flatter the pace number.
- Status lives in the same schedule document as everything else, so it saves to the site with the same version check and there is nothing to keep in sync.
- **One status per occurrence.** A placement is keyed by its placement id, an unplaced task by its activity id. Tasks genuinely repeat — `qm-work-block` is placed 17 times, and two QM routines run every morning and midday of W1 — so marking Friday's gear check done no longer marks Saturday's, and the Progress tab counts 152 pieces of work rather than 133 catalog rows. The rail shows a tally (`1/3`) instead of a toggle for anything scheduled more than once, "hide finished" needs every occurrence done, and a status saved by the earlier activity-keyed version is still read so no older file loses its work.
- `who` is a role id, never a typed name, and `npm run check:schedule` rejects anything that is not in `resources.csv`. The status layer stays inside the same rule as the rest of the project.
- A "hide finished" filter in the rail, which is what shrinks a 130-task list as the team works through it.
- **Help for the people who use the site, rather than build it.** A `? Help` button opens a short overlay, and the same sections print as a **one-page staff card** — one source, so the card cannot drift from the app. 23 of the 30 roles on this course are held by youth staff, and every one of the ten existing documents was written for someone who would run `npm run check`.
- The card deliberately **does not carry the shared password**. A page handed to two dozen teenagers gets photographed and forwarded, and the password is the only thing protecting the encrypted names; it says "ask your ACD" instead.
- **Print all weekends** in the Export menu — every weekend with something scheduled, each on a fresh sheet so the stack splits by weekend. Printing one weekend at a time meant six trips through the event dropdown, and the whole set is what you want on paper before staffing is settled. The menu item carries the count, an empty weekend is named on the cover rather than printed blank, and the single-event print is unchanged.
- [docs/REFERENCE.md](docs/REFERENCE.md) — every feature, control, keyboard shortcut, rule, export and failure mode in one deliberately verbose file, for somebody taking the project over or for an AI assistant that needs to answer questions about it without guessing.
- [docs/USER-GUIDE.md](docs/USER-GUIDE.md) for adult staff — lanes, red and amber, tasks and pace, saving, two people at once, exports. The README's documentation index is now split into *using it* and *working on it*.

### Fixed
- **The app zoomed itself out on a phone.** Three things each forced the page wider than the screen, so mobile browsers shrank everything to fit: the canvas could not shrink below a three-lane day (grid items default to `min-width: auto`), the event `<select>` was sized by its longest option name, and the save indicator is `nowrap` and overhung the last header row. The layout is now 390px wide on a 390px device. This matters most for the youth staff, who will be on phones.
- `api/placements.php` returned an empty task map as `[]` rather than `{}`. Everything there is decoded with `json_decode($s, true)`, which turns `{}` into a PHP array that re-encodes as an array — and the client spreads that value. Caught by a test, not by a person.
- Undo skipped task status: `snapshot()` in `state.js` serialised only placements and custom activities, so a status change could not be undone. Both are now covered by the browser test.

### Changed
- **The site moved to its own domain.** Documented in [DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md#changing-the-sites-domain), because the failure mode is misleading: the new hostname resolved correctly and still served Hostinger's parked page, since pointing DNS at Hostinger does not bind a hostname to a website. The fix is the site's own **Change Website Domain** — never "add a website", which would give the app an empty document root and strand the live schedule in the old folder. No code changed; every path the app fetches is already relative.
- `docs/DEPLOY-HOSTINGER.md` said the publish directory is `dist`. The live site serves the **repository root** — `/package.json` and `/CLAUDE.md` return 200 while `/dist/index.html` is 404 — which is why the root `.htaccess` is the one in force. Corrected, since the domain instructions depend on knowing which folder is served.
- `docs/TROUBLESHOOTING.md` gains the parked-page symptom and "everyone is suddenly in browser-only mode", which is the expected one-visit effect of a hostname change on origin-scoped sessionStorage, not a fault.

### Notes
- They arrived as a schedule file of `customActivities` with `"placements": []`. Loading that would have **replaced the live 148-placement schedule with nothing**, because Load JSON replaces rather than merges. Catalog belongs in the pack; the schedule was never touched.
- Three notes and two titles named individual staff and now read as roles — durable across courses, and the only form the name guard permits. The two titles were re-slugged, since the ids were slugs of them.
- `scripts/scrub.local.txt` (gitignored) gained a `Name -> ROLE-ID` form: the guard still refuses the name, and the importers now know what to put in its place. `import-qm-tasks` refuses to write a row that still carries a name, and refuses to guess when a surname belongs to two people — this roster has three such surnames.
- Seven tasks were written at 20 minutes and snapped to 15. Each is named in the importer's output.
- `qm-make-monkey-fists` and `qm-laser-etch-patches-and-staves` existed as custom activities in the live schedule and would have rendered twice in the rail; removed from the schedule now that the pack owns them. Placements reference ids and carry their own durations, so none moved.

## [0.2.0] — 2026-09-16

The schedule moved from each person's browser onto the website, and the guards that
keep names out of the repository became enforcement rather than documentation.

### Added
- **The schedule is saved on the website.** `api/placements.php` stores one JSON document per pack behind the shared password. Saves land about a second after you stop editing; another person's changes arrive within twenty seconds, but only while your own browser has nothing unsaved. Simultaneous saves are refused with a choice — Use theirs / Keep mine / Save mine to a file — rather than one person silently overwriting the other. Falls back to browser-only when the site is unreachable or no password was entered, and says which mode it is in.
- **`npm run roster`** — `pull`, `push`, `list`, `show`, `set`, `unset`, `check`. `list` and `check` report coverage **without printing a name**, so the roster can be audited and one person renamed without a name entering a transcript. `show` is the only command that prints names and it makes you confirm.
- **`npm run check:schedule -- <file>`** — validates a saved schedule against a pack before importing: blocking problems, warnings that load but are wrong, and what the conflict engine would then show.
- **`npm run cache-bust`** — moves every module URL, stylesheet and runtime fetch to the same new cache key at once.
- **`npm run api-password`** — writes `api/config.php`, a PBKDF2-SHA256 salt and hash, never the password.
- **Guards with teeth:** `name-guard` (secret scan plus structural checks that need no secrets, so CI still catches a tracked secret file or a name-shaped `owner_id`), `validate-pack`, `lint`, all behind `npm run check`, with `npm run install-hooks` making the name guard a pre-commit gate.
- **`scripts/common-name-words.txt`** — a generic, committed list of words that are both ordinary English and names. Without it a roster containing the surname Lane produced 80 false positives, since "lane" is the app's core concept.
- GitHub Actions CI, issue and PR templates, and the contributor documentation set.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — the failures that actually happened, and what each turned out to be.

### Changed
- **The importer reads the Troop, TG Patrol and Flags tabs**, not All modules. The workbook has no formulas, so its four tabs are independent copies that had already drifted — `Practice SD` typed where the workbook tells the Course Director to type it would never have reached the pack.
- **The app opens on an event that has content** and remembers the last one viewed. It opened on SD1, which is deliberately empty, and a blank canvas is indistinguishable from a failed import — it was reported as exactly that. An empty canvas now says so and names the events that do have a schedule.
- **The Outpost lock gates on arrival by 15:00** rather than 17:00, matching the GPS-to-Outpost design in the course agenda.
- The roster password is cached instead of the decrypted roster: one secret in `sessionStorage` rather than two, and the API needs it to save.

### Fixed
- **Hostinger served JavaScript with a seven-day cache**, so a pushed fix did not reach browsers already running the old copy. A committed root `.htaccess` now sends `no-cache, must-revalidate`. Flushing the CDN clears what was already stored; `npm run cache-bust` is the fallback.
- **Cache-busting one file broke the app outright** — a new `main.js` importing a CDN-stale `roster.js` fails with "does not provide an export named …". The whole module graph now moves together.
- Reading `getBoundingClientRect()` after `select()` measured a detached element, so a dragged block landed at the wrong time.

### Security
- Both `GET` and `PUT` on the shared schedule require the password; a failed attempt sleeps 250 ms. `api/config.php` stores only a salt and hash and is executed, never served. `api/data/` is gitignored and blocked from direct fetch. Pack names are sanitised, so a request cannot escape the data directory.

## [0.1.0] — 2026-09-16

First working version.

### Added
- **Canvas** — a day column per event day clipped to the event's hard bounds, a lane per track on a 15-minute spine. All-hands lanes span every other lane, which is how meals and ceremonies block the whole camp.
- **Drag and drop** — pointer events throughout (not HTML5 drag-and-drop): rail to canvas, move, edge-resize, 15-minute snapping, arrow-key nudge, lane change, undo/redo.
- **Block editor** — day, lane, start, duration, people, override flag, notes.
- **Conflict engine** (`src/conflicts.js`, pure and unit-tested) — resource double-booking across lanes, placements outside event bounds, lane overlap, locked slots, TG-delivery mismatch, syllabus day order, readiness gate, practice coverage.
- **Practice coverage panel** — every syllabus presentation against SD1–SD4.
- **Content pack `nylt-27-1`** — 89 activities (25 presentations imported from the Presentations Authority workbook with exact durations, 54 from last year's schedule with inferred durations, 10 staff extras), the six locked 2026–27 event windows, lanes, and seed constraints.
- **Encrypted roster** — `roster.local.csv` → `public/roster.enc` (PBKDF2-SHA256 210k → AES-256-GCM), decrypted in the browser behind a password gate. Role codes without it.
- **Exports** — run-of-show CSV, Presentations-Authority-shaped sync CSV that fills in Practice SD and Practice date/time, and a print view with one table per day.
- **Start from last year** — copies a 26-1 day layout onto a day as a starting point.
- **Save/Load JSON** for handing a schedule between people through the shared Drive folder, plus localStorage autosave.
- Zero-dependency toolchain: `scripts/xlsx.mjs` (xlsx reader), `src/csv.js` (RFC 4180), `scripts/build.mjs` (static build), `server.mjs` (dev server).
