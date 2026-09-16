# Program Scheduler — NYLT 27-1

A small drag-and-drop scheduler for multi-day programs. Catalog on the left, a 15-minute day canvas in the middle, a constraint engine that turns conflicts red, and a run-of-show export. The first content pack is Black Warrior Council **NYLT Course 27-1**: four Staff Development weekends and two course weekends. Any other program (Wood Badge, OA, a retreat) is a new folder of five CSVs — see [docs/CONTENT-PACKS.md](docs/CONTENT-PACKS.md).

Core loop: **catalog → canvas → constraints → export.**

## Run it

No dependencies, no build tooling. Node is only used as a static file server and for the scripts.

```
npm run dev          # http://localhost:3000
npm test             # unit tests for the conflict engine and roster crypto
npm run build        # copies deployable files to dist/ (what Hostinger publishes)
```

Deploying: [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md).

## Using it

1. Pick an event (SD1–SD4, Course Weekend 1, Course Weekend 2) at the top.
2. Drag an activity from the left rail onto a lane at a time. It snaps to 15 minutes and comes pre-sized from the catalog. Drag the bottom edge to resize, drag the block to move it, arrow keys nudge it (Shift = one hour, ← → change lane), Delete removes it.
3. Click a block to edit it: people, minutes, lane, notes, the Override flag.
4. **All Hands** lanes span every other lane — meals, Gilwell, campfires. **TG & Presenters** and **Quartermasters** lanes run in parallel.
5. Red = hard conflict (someone double-booked, two things in one lane, outside the event's hours, a locked slot violated). Amber = worth a look (a TG module in the main hall, a presentation out of syllabus order). The **Issues** panel lists them; click one to jump to it.
6. **Practice coverage** shows every syllabus presentation against SD1–SD4: ✓ placed in its assigned Practice SD, ✗ assigned but not placed, ? no Practice SD assigned yet.
7. **Start from last year** (Event panel) copies one of the 26-1 day layouts onto a day as a starting point.
8. **+ Quick activity** adds something that is not in the catalog — SD-weekend staff tasks, for example.
9. **Export ▾**: run-of-show CSV, an Authority-sheet-shaped CSV (Practice SD and Practice date/time filled in), or Print / Save as PDF for one table per day.

The schedule autosaves in your browser. **Save JSON** writes a file you can drop in the shared Drive folder and **Load JSON** brings it back on another machine; the header shows when there are changes not yet saved to a file.

## Names

The repository and the site are public, so committed files contain **roles only** (`TG-1`, `QM-ADULT`, `SPL`). Real names live in `roster.local.csv` (gitignored) and ship as `public/roster.enc`, encrypted with the shared password. Enter it once per device to see names; without it everything works with role codes.

```
npm run encrypt-roster                 # prompts for the password
npm run encrypt-roster -- --generate   # invents a passphrase and prints it
```

Rule for contributors: **never commit a real name in plaintext.** Git history is permanent. The importer refuses to write output containing a roster name.

## Layout

```
index.html, src/            the app (plain ES modules)
packs/nylt-27-1/            content pack: activities, events, tracks, resources, constraints, templates
public/roster.enc           encrypted names
scripts/                    import-catalog (xlsx -> CSVs), encrypt-roster, build
docs/                       DATA-MODEL, CONTENT-PACKS, DEPLOY-HOSTINGER
tests/                      node:test
```

## Out of scope for v1

Multi-user editing (see the PHP note in the deploy doc), auto-scheduling, live Band/Trello/Sheet sync, replacing the AppSheet owner/Ready workflow, mobile drag polish (mobile is for review).
