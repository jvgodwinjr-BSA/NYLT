# Contributing

This is a volunteer tool for Black Warrior Council NYLT. Small, practical changes welcome.

## Before anything else: names

**Never commit a real person's name.** The repository and the deployed site are public, and most of the roster are youth. Read [docs/YOUTH-PROTECTION.md](docs/YOUTH-PROTECTION.md) first — it is short and it is the most important document here.

Install the guard once and it will stop you:

```
npm run install-hooks     # pre-commit runs the name guard
```

## Setup

Node 18+ (22 recommended, see `.nvmrc`). There is nothing to install — the project has zero runtime dependencies on purpose.

```
git clone https://github.com/jvgodwinjr-BSA/NYLT.git
cd NYLT
npm run install-hooks
npm run dev               # http://localhost:3000
```

To see real names locally, pull them out of the encrypted roster with the shared password:

```
npm run roster -- pull
```

That writes `roster.local.csv` (gitignored) and seeds `scripts/scrub.local.txt`, which switches the name guard from structural-only to the full name scan. Confirm with `npm run check:names` — it should report "Scanned N file(s) against M name token(s)" rather than "only the structural checks ran".

## The gate

```
npm run check
```

Runs, in order: `lint` (every script parses, zero dependencies, `conflicts.js` stays pure), `check:pack` (referential integrity across the pack CSVs), `check:names` (nothing name-shaped is committed), and the unit tests. CI runs the same thing on every pull request. A change that does not pass is not ready.

For anything touching the canvas, drag, or editor, also exercise it in a real browser. Screenshots do not prove dragging works — script the interaction and assert on the resulting block times and classes.

## Making common changes

| You want to | Do this |
|---|---|
| Fix a duration or rename an activity | Edit `packs/nylt-27-1/activities.csv`, run `npm run check:pack` |
| Change an event's dates or hours | Edit `packs/nylt-27-1/events.csv` |
| Add or rename a lane | Edit `packs/nylt-27-1/tracks.csv` |
| Add a scheduling rule | Add a row to `constraints.csv`; if it needs a new `rule_type`, implement it in `src/conflicts.js` and add a test |
| Re-import after the Authority sheet changes | Put the workbooks in `source/` (gitignored), run `npm run import-catalog` |
| Add or rename a staff person | Add the **role** to `resources.csv`, then `npm run roster -- set <id> "<name>"` — it re-encrypts under the same password |
| Support a different program | New folder under `packs/` — see [docs/CONTENT-PACKS.md](docs/CONTENT-PACKS.md) |
| Import a hand-authored schedule | `npm run check:schedule -- <file>` first — it catches bad lane ids, unknown activities and off-grid times before they reach anyone |
| Change the shared password | `npm run roster -- push` and `npm run api-password`, then commit `public/roster.enc` and `api/config.php` |
| Force browsers past a stale CDN copy | `npm run cache-bust`, then commit and push. See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |

## Code conventions

ES modules, 2-space indent, semicolons, single quotes. Comments explain *why*. The architectural invariants are listed in [CLAUDE.md](CLAUDE.md) — particularly: zero dependencies, `conflicts.js` stays pure, drag-and-drop only writes `Placement`, times are minutes since midnight in multiples of 15.

There is no `package-lock.json` because there are no dependencies. If you ever add one, you have almost certainly taken a wrong turn; talk about it in an issue first.

## Pull requests

Branch off, keep the change focused, make sure `npm run check` passes, and fill in the PR template. Say what you verified and how — "ran `npm run check`" plus, for UI work, what you actually clicked or dragged.

## When something looks broken

[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) covers the failures that have actually happened here — a blank canvas that was the wrong event, a CDN serving week-old JavaScript, a schedule saving to one browser instead of the site. Check it before filing anything.

## Reporting a problem

Open an issue using one of the templates. For anything involving exposed names or the shared password, follow [SECURITY.md](SECURITY.md) instead — do not open a public issue.
