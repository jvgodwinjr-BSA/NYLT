# Content packs

A pack is a folder under `packs/` with five CSVs (and an optional `templates.json`). The app loads the pack named by `PACK_ID` in `src/config.js`. Nothing in `src/` knows about NYLT.

```
packs/<pack-id>/
  activities.csv    id,name,duration_min,type,audience,delivery,group,syllabus_day,soft_vs_hard,practice_sd,owner_id,ready,location,tags,notes,source
  events.csv        id,name,hard_start,hard_stop,location,notes
  tracks.csv        id,event_id,name,is_all_hands,sort
  resources.csv     id,role,kind,team,sort
  constraints.csv   id,event_id,rule_type,params,severity,description
  templates.json    optional: { "<key>": { "label", "items": [{ "activity_id", "start_min", "duration_min" }] } }
```

## Making one for another program

1. Copy `packs/nylt-27-1/` to `packs/<your-id>/`.
2. **events.csv** — one row per weekend/day-block with `hard_start`/`hard_stop` as `YYYY-MM-DDTHH:MM`.
3. **tracks.csv** — at least one lane per event. Mark the lane that means "everyone" with `is_all_hands=true`. Add parallel lanes for groups that work at the same time.
4. **activities.csv** — everything that goes on the clock, including meals and ceremonies (so the clock is complete). Keep `id` stable; placements reference it. Columns you do not use can stay blank (`group`, `syllabus_day`, `practice_sd`, `ready`).
5. **resources.csv** — roles, not names. Names go in `roster.local.csv` and get encrypted.
6. **constraints.csv** — start with the built-in three (they need no rows). Add `lock_slot` rows for fixed moments, and the others if your program has the concept.
7. Set `PACK_ID` in `src/config.js`, or run two deployments from two branches.

Practice coverage and the Authority-sheet export are NYLT-shaped only in the sense that they read `practice_sd` / `ready` and the `practice_coverage` constraint; a program without those columns simply shows an empty coverage panel.

## Importing from a spreadsheet

`scripts/import-catalog.mjs` is the NYLT importer (Presentations Authority workbook + last year's schedule). For another program, the simplest path is to export your sheet to CSV with the columns above. `scripts/xlsx.mjs` is a zero-dependency .xlsx reader you can reuse if you would rather parse a workbook.

The importer refuses to write output containing any name from `roster.local.csv` or `scripts/scrub.local.txt`. Keep that behaviour if you fork it.

The `source` column records where a row came from — `authority`, `spine-26-1`, `extras`, `qm-tasks`. `scripts/extras-nylt-27-1.csv` is the hand-maintained half; a row's `source` there is carried through, and an importer that owns a source (as `import-qm-tasks.mjs` owns `qm-tasks`) rewrites only its own rows.

### Scrubbing names out of hand-authored input

A task list written by a human names people. `scripts/import-qm-tasks.mjs` replaces each name with the role that person holds, taking the name→role pairs from `roster.local.csv` and from `Name -> ROLE-ID` lines in `scripts/scrub.local.txt` (both gitignored). The second file is for what the roster cannot answer: a spelling the author used that the roster no longer carries, a past year's staff, a set of initials.

Two things it deliberately will not do. It will not resolve a name token that two roles share — this roster has three such surnames, and guessing would file a task under the wrong person. And it will not write a row that still carries a name: it stops and prints the activity id and field, never the name, so the report is safe in a log. Both are fixed the same way, with an explicit `Name -> ROLE-ID` line.

Titles are slugged into ids, so a title that named someone put that name in the id too. Those rows are re-slugged from the scrubbed title; every other id stays exactly as the author wrote it.
