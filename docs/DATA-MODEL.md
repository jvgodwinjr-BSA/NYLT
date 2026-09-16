# Data model

Six shapes. Drag-and-drop only ever writes **Placement** (and Quick activities). The catalog is authoritative and comes from CSV.

```
Activity      id, name, duration_min, type, audience, delivery, group, syllabus_day,
              soft_vs_hard, practice_sd, owner_id, ready, location, tags[], notes, source
Resource      id, role, kind, team, sort                 (no name field — see Roster)
Event         id, name, hard_start, hard_stop, location, notes
Track         id, event_id, name, is_all_hands, sort
Placement     id, activity_id, event_id, track_id, day, start_min, duration_min,
              resource_ids[], flags[], notes
Constraint    id, event_id?, rule_type, params (JSON), severity, description
```

## Activity — `packs/<pack>/activities.csv`

| field | values |
|---|---|
| `type` | presentation · meal · ceremony · meeting · outpost · game · logistics · staff_task · other |
| `audience` | troop · patrol · staff |
| `delivery` | Troop · TG · Staff |
| `group` | A (main hall) · B (patrol / TG) · C (flag ceremony) · blank |
| `syllabus_day` | 1–6 or blank |
| `soft_vs_hard` | hard = syllabus-required, never silently dropped · soft = compressible |
| `practice_sd` | SD1 · SD2 · SD3 · SD4 · blank (mirrors the Authority sheet) |
| `ready` | Not started · Outline · Practiced · Ready |
| `tags` | pipe-separated |
| `source` | authority · spine-26-1 · extras · custom |

Quick activities created in the app have `source=custom`, live in the saved schedule (not the pack), and are never written back to the Authority sheet.

## Event and days

`hard_start` / `hard_stop` are camp-local `YYYY-MM-DDTHH:MM`; there is no timezone math anywhere. `computeDays()` in `src/pack.js` expands an event into days, each clipped to the bounds: a Friday that starts at 18:00 renders 18:00–23:30; a Sunday that ends at 16:00 renders 06:00–16:00. `DAY_START_MIN` / `DAY_END_MIN` in `src/config.js` set the full-day window.

## Track (lane)

Every event declares its lanes in `tracks.csv`. A lane with `is_all_hands=true` **blocks every other lane** while something is in it — that is how "at meals we are all together" works without special cases. Seeded lanes: SD weekends get All Hands / TG & Presenters / Quartermasters; course weekends get Troop (main hall) / Patrols (TG) / Quartermasters.

## Placement — the only thing the canvas edits

```json
{ "id": "k3f9a1", "activity_id": "servant-leadership", "event_id": "W2", "track_id": "W2-all",
  "day": "2027-02-20", "start_min": 660, "duration_min": 60,
  "resource_ids": ["ASPL-PGM"], "flags": [], "notes": "" }
```

`start_min` is minutes since midnight, always a multiple of 15. `duration_min` defaults from the activity and can be overridden per placement. `resource_ids` pre-fills from the activity's `owner_id`. Flags: `override` silences the TG-delivery warning; `overlap-ok` silences the lane-overlap rule for that block.

**Flags** on a placement:

| Flag | Effect |
|---|---|
| `override` | Silences `delivery_mismatch` — this TG module is in the main hall on purpose |
| `overlap-ok` | Silences `track_overlap` for this block — deliberate parallel work, e.g. QM cleanup during closeouts |
| `practice` | Marks a rehearsal placement on an SD weekend. Carried in exports; no rule reads it |

## The saved schedule document

The same shape whether it came from **Save JSON** or from the server:

```json
{ "format": "program-scheduler/schedule", "version": 17, "pack": "nylt-27-1",
  "savedAt": "2026-09-16T03:38:33+00:00", "savedBy": "ACD",
  "placements": [...], "customActivities": [...] }
```

`version` is what makes shared editing safe. Every server write increments it, and a `PUT` carrying a stale version is rejected with **409** plus the current document, rather than overwriting someone else's work. `savedBy` is a free-text label, trimmed to 40 characters, purely so a person can tell where a change came from. Use a role id rather than a name: it is stored in plain text on the server and in every exported file, and it is never used for access control.

A file written by **Save JSON** may carry `version` from whenever it was exported. Loading it pushes to the server with `force`, because the person choosing a file has said plainly which copy they want.

`customActivities` are Quick activities: they live in the schedule, not the pack, and are never written back to the Authority sheet. They must carry the same fields a pack activity does — `id, name, duration_min, type, audience, delivery, soft_vs_hard, tags` — or the left rail cannot render them. `npm run check:schedule` enforces that.

## Constraint — `constraints.csv`, `params` is JSON

| rule_type | params | severity | what it checks |
|---|---|---|---|
| *(built in)* `resource_double_booked` | — | hard | one resource on two overlapping placements, across lanes |
| *(built in)* `outside_event_bounds` | — | hard | placement outside the event's day windows |
| *(built in)* `track_overlap` | — | hard | two placements overlap in one lane, or either is all-hands |
| `lock_slot` | `{activity_id, day, not_before?, not_after?}` | as set | that activity must sit on that day / in that window; a quiet notice if it is not placed at all |
| `delivery` | `{delivery:"TG", disallow_all_hands:true}` | soft | TG modules should not sit in an all-hands lane unless `override` |
| `syllabus_day_order` | `{day_map:{W1:[1,2,3],W2:[4,5,6]}}` | soft | presentation on a course day earlier than its syllabus day |
| `ready_gate` | `{events:["W1","W2"], required:"Ready"}` | soft, quiet | presentation on the course not yet marked Ready |
| `practice_coverage` | `{sd_events:["SD1","SD2","SD3","SD4"]}` | soft, quiet | every presentation placed in its assigned Practice SD; unassigned flagged |

**Quiet** violations appear in the Issues panel but do not paint blocks (readiness and coverage would otherwise turn every block amber). The engine is `src/conflicts.js`: a pure function `evaluate({placements, activities, events, constraints}) → Violation[]`, covered by `tests/conflicts.test.mjs`.

## Where the schedule is stored

`api/placements.php` holds one JSON document per pack in `api/data/`, which is gitignored and blocked from direct fetch. Both `GET` and `PUT` require the shared password in the `X-Schedule-Password` header; the server keeps only a PBKDF2-SHA256 hash of it in `api/config.php`.

The browser uses `src/store/apiStore.js` and falls back to `src/store/localStore.js` when the API is absent, unreachable, or no password was entered — so the app still works, it just is not shared, and the header says `browser only`. `?local=1` forces that deliberately.

Writes are debounced ~1.2s after the last change. A poll every 20s adopts a newer server version, but only when the local browser has nothing unsaved.

## Which event opens

Landing on an empty event looks identical to a failed load, so the choice is deliberate: an explicit `?event=` wins, then the event this browser last viewed if it still has content, then the first event that has any placements, then the first event in the pack. The last viewed event is remembered in `localStorage` per pack.

## Roster (names)

`resources.csv` has no name column on purpose. `roster.local.csv` (`id,name`, gitignored) is encrypted by `scripts/encrypt-roster.mjs` into `public/roster.enc` (PBKDF2-SHA256, 210 000 iterations → AES-256-GCM). The browser decrypts it with WebCrypto after the password gate and keeps the map in memory and `sessionStorage` only. Everything that displays a person calls `resourceLabel(id)`, which returns the name when unlocked and the id otherwise. Exports render whatever is displayed and are generated client-side.
