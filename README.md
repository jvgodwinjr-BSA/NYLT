# Program Scheduler — NYLT 27-1

A small drag-and-drop scheduler for multi-day programs. Catalog on the left, a 15-minute day canvas in the middle, a constraint engine that turns conflicts red, and a run-of-show export. The first content pack is Black Warrior Council **NYLT Course 27-1**: four Staff Development weekends and two course weekends. Any other program (Wood Badge, OA, a retreat) is a new folder of five CSVs — see [docs/CONTENT-PACKS.md](docs/CONTENT-PACKS.md).

Core loop: **catalog → canvas → constraints → export.**

## Run it

No dependencies, no build tooling. Node is only used as a static file server and for the scripts.

```
npm run dev              # http://localhost:3000
npm run check            # the gate: lint + pack validation + name guard + tests
npm run build            # copies deployable files to dist/
npm run install-hooks    # one-time: pre-commit guard against committing a real name
```

### Every command

| Command | Does |
|---|---|
| `npm run dev` | Serve the app at http://localhost:3000. Names work here without HTTPS — localhost is a secure origin. |
| `npm run check` | The gate. Run before every commit. |
| `npm run check:pack` | Referential integrity across the pack CSVs. |
| `npm run check:names` | Nothing name-shaped is committed. |
| `npm run check:schedule -- <file>` | Validate a saved schedule against the pack **before** importing it. |
| `npm run build` | Static build into `dist/`. |
| `npm run roster -- <cmd>` | Manage names: `pull`, `push`, `list`, `show`, `set`, `unset`, `check`. |
| `npm run api-password` | Regenerate `api/config.php` after a password change. |
| `npm run import-catalog` | Rebuild `activities.csv` from the source workbooks in `source/`. |
| `npm run import-qm-tasks` | Convert `scripts/qm-tasks-source.json` into extras rows, then re-run `import-catalog`. |
| `npm run cache-bust` | Move every app URL to a new cache key. Only when a CDN edge goes stale. |
| `npm test` | Unit tests. |

Deploying: [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md). Something wrong: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Using it

1. Pick an event (SD1–SD4, Course Weekend 1, Course Weekend 2) at the top.
2. Drag an activity from the left rail onto a lane at a time. It snaps to 15 minutes and comes pre-sized from the catalog. Drag the bottom edge to resize, drag the block to move it, arrow keys nudge it (Shift = one hour, ← → change lane), Delete removes it.
3. Click a block to edit it: people, minutes, lane, notes, the Override flag.
4. **All Hands** lanes span every other lane — meals, Gilwell, campfires. **TG & Presenters** and **Quartermasters** lanes run in parallel.
5. Red = hard conflict (someone double-booked, two things in one lane, outside the event's hours, a locked slot violated). Amber = worth a look (a TG module in the main hall, a presentation out of syllabus order). The **Issues** panel lists them; click one to jump to it.
6. **Practice coverage** shows every syllabus presentation against SD1–SD4: ✓ placed in its assigned Practice SD, ✗ assigned but not placed, ? no Practice SD assigned yet.
6a. The app opens on an event that has something in it, and remembers the last one you looked at. An empty event says so rather than showing a silent blank grid.
7. **Start from last year** (Event panel) copies one of the 26-1 day layouts onto a day as a starting point.
8. **+ Quick activity** adds something that is not in the catalog — SD-weekend staff tasks, for example.
9. **Export ▾**: run-of-show CSV, an Authority-sheet-shaped CSV (Practice SD and Practice date/time filled in), or Print / Save as PDF for one table per day.

## Where the schedule is saved

The schedule lives **on the website**, so you and the Course Director see the same plan. `api/placements.php` stores one JSON file per content pack, behind the same shared password that unlocks the roster.

- Changes save automatically about a second after you stop editing. The header shows `✓ saved to site`.
- Another person's changes appear within about twenty seconds, without anyone reloading — but only when you have nothing unsaved, so an edit in progress is never yanked away.
- If two people save at once the second one is refused rather than silently overwriting. A banner offers **Use theirs**, **Keep mine**, or **Save mine to a file first**.
- If the site is unreachable, or you open the app without the password, it falls back to a browser-only copy and says so (`browser only`). Nothing is lost; it just is not shared.
- **Save JSON** still exists, and is worth doing at milestones — it is a backup you control and the only copy that survives if the server file is ever lost.

Add `?local=1` to the URL to work in browser-only mode deliberately.

Setting it up (once per password change):

```
npm run api-password     # writes api/config.php — a salt and a hash, never the password
```

Commit `api/config.php` and push.

## Names

The repository and the site are public, so committed files contain **roles only** (`TG-1`, `QM-ADULT`, `SPL`). Real names live in `roster.local.csv` (gitignored) and ship as `public/roster.enc`, encrypted with the shared password. Enter it once per device to see names; without it everything works with role codes.

## Managing names

Never open `roster.local.csv` by hand and never read it into an agent's context. Everything goes through one command, which does its job without displaying a name unless you explicitly ask:

```
npm run roster -- pull                       # new machine: decrypt roster.enc -> roster.local.csv
npm run roster -- list                       # who is named, who is missing — NO names printed
npm run roster -- set ASPL-QM "Jane Doe"     # set or rename one person, then re-encrypt
npm run roster -- unset TG-4                 # clear one person
npm run roster -- check                      # roles all named, and roster.enc is not stale
npm run roster -- push                       # re-encrypt after hand-editing the CSV
npm run roster -- show                       # ids AND names — asks you to confirm first
```

`set`, `unset` and `push` re-encrypt with the **same** password, so nobody needs a new one. Commit `public/roster.enc` and push; Hostinger redeploys. Viewers should hard-refresh, because the browser caches the decrypted roster in `sessionStorage` for the tab.

The password comes from a hidden prompt, `ROSTER_PASSWORD`, or `--password`.

Rule for contributors: **never commit a real name in plaintext.** Git history is permanent. `npm run check:names` enforces it, and `npm run install-hooks` makes it a pre-commit gate.

## Layout

```
index.html, src/            the app (plain ES modules)
packs/nylt-27-1/            content pack: activities, events, tracks, resources, constraints, templates
public/roster.enc           encrypted names
api/                        placements.php — shared schedule storage (PHP, on the website)
scripts/                    import-catalog (xlsx -> CSVs), encrypt-roster, api-password,
                            build, name-guard, validate-pack, lint, hooks/
docs/                       DATA-MODEL, CONTENT-PACKS, DEPLOY-HOSTINGER, YOUTH-PROTECTION
tests/                      node:test — conflict engine, roster crypto, guards
```

## Documentation

| | |
|---|---|
| [docs/YOUTH-PROTECTION.md](docs/YOUTH-PROTECTION.md) | **Read this first.** Where personal information may and may not go |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Activity, Resource, Event, Track, Placement, Constraint, and every rule |
| [docs/CONTENT-PACKS.md](docs/CONTENT-PACKS.md) | Running a different program from the same engine |
| [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md) | Publishing, SSL, rotating the password, shared editing later |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, the gate, how to make common changes |
| [SECURITY.md](SECURITY.md) | Threat model, what the encryption does and does not protect |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Blank schedule, stale cache, names not showing, import failures |
| [CLAUDE.md](CLAUDE.md) | Architectural invariants, for humans and for Claude Code |
| [CHANGELOG.md](CHANGELOG.md) | What changed and when |

## Out of scope for v1

Multi-user editing (see the PHP note in the deploy doc), auto-scheduling, live Band/Trello/Sheet sync, replacing the AppSheet owner/Ready workflow, mobile drag polish (mobile is for review).

## License

**Copyright © 2026 the owner of [github.com/jvgodwinjr-BSA](https://github.com/jvgodwinjr-BSA). All rights reserved.**

This repository is public so it can be deployed and reviewed, but no license to use, copy, modify, or redistribute it is granted. If you are with another council and this would be useful to you, open an issue and ask — the answer is likely yes, it just needs to be said explicitly first.

<sub>The holder is named by GitHub account rather than in full because the name guard keeps personal names out of this repository (see [docs/YOUTH-PROTECTION.md](docs/YOUTH-PROTECTION.md)). To use a full legal name here instead, append `name-guard:allow` in an HTML comment on that line.</sub>
