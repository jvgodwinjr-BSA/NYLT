# Changelog

Notable changes to the Program Scheduler. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Nothing yet.

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
