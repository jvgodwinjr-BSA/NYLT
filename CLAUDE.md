# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A drag-and-drop **Program Scheduler** for multi-day programs. Catalog on the left, a 15-minute day canvas in the middle, a constraint engine that turns conflicts red, exports on the way out. The first content pack is Black Warrior Council **NYLT Course 27-1** (SD1–SD4, Course Weekend 1, Course Weekend 2). Nothing in `src/` knows about NYLT; a different program is a different folder of CSVs.

## Hard rules

These are not style preferences. Breaking any of them breaks something real.

1. **Never read or print the roster; use `npm run roster`.** `roster.local.csv` holds youth names, and anything an agent reads lands in a transcript. `npm run roster -- list` and `-- check` report coverage without names; `-- set <id> "<name>"` renames one person and re-encrypts. `.claude/settings.json` denies reading the file directly. Never commit a real person's name. The repository and the deployed site are public and the roster is mostly minors. Names live in `roster.local.csv` (gitignored) and reach the browser only as `public/roster.enc`. `npm run check:names` enforces this; `npm run install-hooks` makes it a pre-commit gate. Git history is permanent, so a name committed once is committed forever.
2. **Zero runtime dependencies.** No bundler, no framework, no npm packages in `dependencies`. Hostinger runs `npm install && npm run build`; with nothing to install, that step cannot fail. `scripts/build.mjs` is a file copy. CSV parsing is `src/csv.js`, xlsx reading is `scripts/xlsx.mjs`.
3. **`src/conflicts.js` stays pure.** No DOM, no imports from `state.js` or `canvas.js`. It is `evaluate({placements, activities, events, constraints}) → Violation[]` so tests and a future PHP/Node server can call it. `npm run lint` enforces this.
4. **Drag-and-drop only writes `Placement`** (and Quick activities). The catalog is authoritative and comes from CSV.
5. **Times are camp-local minutes since midnight, always multiples of 15.** No `Date` arithmetic for schedule times, no timezones. `SLOT_MIN` in `src/config.js` is the one source of truth.
6. **Never refuse a drop.** A conflicting placement lands and turns red. The tool reports; it does not overrule the person.
7. **Bust the cache as a whole graph or not at all.** The app is unbundled ES modules with no content hashing. A new `main.js` importing a CDN-stale `roster.js` fails with "does not provide an export named …" and the app does not start — worse than uniformly stale. `npm run cache-bust` moves every import, stylesheet and runtime fetch to the same `?v=` together, and updates `ASSET_V` in `config.js` for URLs built at run time. Never hand-edit one.
8. **Never open on an empty view.** An empty canvas is indistinguishable from a failed load, and was reported as exactly that. The app picks an event that has content and says so when one does not.

## Layout

```
index.html  src/           the app (browser ES modules, no build step)
  config.js                grid constants, PACK_ID
  pack.js                  loads a content pack; computeDays() clips days to event bounds
  state.js                 in-memory state, undo/redo, the only mutators
  canvas.js  drag.js       rendering and all pointer-event dragging
  conflicts.js             pure rule engine + coverage matrix
  editor.js  catalog.js    right panel, left rail
  roster.js                WebCrypto decrypt of roster.enc; caches the password, not the roster
  store/apiStore.js        shared schedule on the site; localStore.js is the offline fallback
  export/                  run-of-show CSV, Authority-sheet sync CSV, print view
api/placements.php         shared schedule storage; version-checked writes, password on every request
packs/nylt-27-1/           five CSVs + templates.json — see docs/CONTENT-PACKS.md
scripts/                   import-catalog, encrypt-roster, build, name-guard, validate-pack, lint
docs/                      DATA-MODEL, CONTENT-PACKS, DEPLOY-HOSTINGER, YOUTH-PROTECTION
```

## Verifying

```
npm run check                     # lint + pack validation + name guard + unit tests
npm run build                     # produces dist/
npm run dev                       # http://localhost:3000
npm run check:schedule -- <file>  # validate a saved schedule against the pack
```

`npm run check` is the gate. Run it before every commit. For UI changes, also drive a real browser — Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and `playwright-core` can be installed in a scratch directory (never as a project dependency). Screenshots alone do not prove dragging works; script the drag and assert on the resulting block times and CSS classes.

## Conventions

- ES modules, 2-space indent, semicolons, single quotes.
- Comments explain *why*, not *what*. Match the density of the surrounding file.
- Prefer a small pure function over a new module.
- `el()` in `src/util.js` builds DOM; do not reach for a template library.
- Commit messages: imperative subject line, a blank line, then bullets for anything non-obvious.

## Things that will bite you

- Selecting a block re-renders the canvas and detaches the element. Read `getBoundingClientRect()` *before* calling `select()` (see the comment in `drag.js`).
- `el()` ignores `null`/`false` children, but `append(...)` on an array containing `null` inserts the string "null" — filter first.
- An all-hands lane blocks every other lane. That is the mechanism behind "at meals we are all together"; do not special-case meals.
- Several roster surnames are ordinary English words (Lane is the worst — "lane" is the app's core concept). `scripts/common-name-words.txt` is a generic, committed allowlist that stops ~80 false positives; per-roster additions are `-word` lines in the gitignored `scripts/scrub.local.txt`. Never move that generic list's contents into a roster-derived list — that leaks the names it protects.
- The schedule is stored on the website, not the browser. `localStore` is only the offline fallback. A save carries the version it was based on; the server refuses a stale one with 409 rather than clobbering, and the client shows a conflict banner. Do not "simplify" that away.
- The Authority workbook has no formulas: Troop / TG Patrol / Flags / All modules are four independent copies. The importer reads the first three and warns about drift in the fourth.
- `Practice SD` is blank for every presentation until the Course Director fills it in and the catalog is re-imported. An empty coverage matrix is expected, not a bug.
- Hostinger's CDN caches static files for a week by default. The committed `.htaccess` overrides that with `no-cache, must-revalidate`, but it cannot evict what is already stored — flushing is a button in their dashboard. `x-hcdn-cache-status` on any response says whether an edge is serving a cached copy.
- Deploys are from `main`, and a git-pull-style sync leaves `api/data/` (the live shared schedule) alone. Verify that still holds if the deploy method ever changes.
- Before handing over a schedule file, run `npm run check:schedule`. Eyeballing it missed a closing event and a dismissal stacked in the same slot.
