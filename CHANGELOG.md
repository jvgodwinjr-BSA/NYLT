# Changelog

Notable changes to the Program Scheduler. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `npm run roster` — one command for the roster (`pull`, `push`, `list`, `show`, `set`, `unset`, `check`). `list` and `check` report coverage without printing a name, so a name change no longer means opening a file full of youth names or pasting a multi-line `node -e` block. `set`/`unset`/`push` re-encrypt under the existing password, so nobody needs a new one.
- `scripts/common-name-words.txt` — a generic, committed list of words that are both ordinary English and names. Without it a roster containing a surname like Lane produced 80 false positives ("lane" appears 58 times, since lanes are the core concept), which made the guard unusable on a fresh clone. Being generic rather than roster-derived, it leaks nothing.
- `npm run check` — one gate for lint, pack validation, name guard, and unit tests.
- `scripts/name-guard.mjs` blocks real names from reaching the repository, with a pre-commit hook (`npm run install-hooks`) and a CI fallback that needs no secrets.
- `scripts/validate-pack.mjs` checks referential integrity across the pack CSVs.
- Contributor documentation: `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `docs/YOUTH-PROTECTION.md`.
- GitHub Actions CI, issue templates, and a pull request template.

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
