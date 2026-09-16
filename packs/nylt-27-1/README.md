# Content pack: NYLT 27-1 (Black Warrior Council)

Five CSVs. The app loads them at startup; the scheduler never edits them. To change the catalog, edit the CSV (or re-run the importer) and reload.

| File | What it is | Edit by hand? |
|---|---|---|
| `activities.csv` | Everything that can go on the clock: 25 syllabus presentations, meals, ceremonies, meetings, games, logistics, staff tasks | Yes, but presentations should come from the Authority sheet via `npm run import-catalog` |
| `events.csv` | The six weekends with hard start/stop | Yes |
| `tracks.csv` | Lanes per event. `is_all_hands=true` lanes block every other lane | Yes |
| `resources.csv` | Roles (people slots). **No names** — names live in the encrypted roster | Yes |
| `constraints.csv` | Rules the conflict engine enforces. `params` is JSON | Yes |

## Where activities came from

- **`source=authority`** — `NYLT_2027_Presentations_Authority.xlsx`, "All modules" sheet. Durations are exact (`Time allowed`). `practice_sd`, `owner_id`, `ready` mirror the sheet's `Practice SD`, `Owner`, `Ready` columns; re-import when the Course Director updates them.
- **`source=spine-26-1`** — `26-1 Schedule BLACKWARRIOR.xlsx`, Day 1–6 sheets. Durations are the most common block length observed last year and are a **draft**. The `notes` column shows every duration observed and on which days. Review these.
- **`source=extras`** — `scripts/extras-nylt-27-1.csv`. SD-weekend staff tasks that are not in the syllabus.

Re-run: `npm run import-catalog` (needs the two source workbooks in `source/`, which is gitignored). The importer refuses to write if any roster name appears in the output.

## Columns in `activities.csv`

`id` stable slug · `name` · `duration_min` · `type` (presentation / meal / ceremony / meeting / outpost / game / logistics / staff_task / other) · `audience` (troop / patrol / staff) · `delivery` (Troop / TG / Staff) · `group` (A main hall / B patrol-TG / C flag) · `syllabus_day` 1–6 · `soft_vs_hard` (hard = syllabus-required, never silently dropped; soft = compressible) · `practice_sd` SD1–SD4 · `owner_id` → `resources.csv` · `ready` (Not started / Outline / Practiced / Ready) · `location` · `tags` pipe-separated · `notes` · `source`

## Making a pack for another program

Copy this folder, replace the five CSVs, keep the column headers. See `docs/CONTENT-PACKS.md`.
