# Program Scheduler — complete reference

Everything the application does, where each control lives, and what it is for. Written to be read
start-to-finish by a person taking the tool over, or loaded whole by an AI assistant that needs to
answer questions about it without guessing.

**If you only want to use the thing**, read [USER-GUIDE.md](USER-GUIDE.md) or press **? Help** in
the app. This file is exhaustive on purpose and is longer than anybody needs for ordinary work.

---

## 1. What this application is

A drag-and-drop scheduler for multi-day programs. The working metaphor is a wall planner: a
catalog of things that can happen on the left, a day-by-day grid in the middle, and a panel on the
right that explains whatever you are looking at.

The core loop is **catalog → canvas → constraints → export**:

1. **Catalog** — everything that *could* be scheduled, loaded from CSV files.
2. **Canvas** — you drag items onto a 15-minute grid to say when they happen.
3. **Constraints** — a rule engine marks clashes red or amber as you work.
4. **Export** — run-of-show CSV, a sync file for the source workbook, and print/PDF.

The first and currently only content pack is Black Warrior Council **NYLT Course 27-1**: four
Staff Development weekends (SD1–SD4) and two Course Weekends (W1, W2). Nothing in the application
code knows about NYLT. A different program is a different folder of CSV files; see
[CONTENT-PACKS.md](CONTENT-PACKS.md).

### Why it is built the way it is

| Decision | Reason |
|---|---|
| Zero runtime dependencies | The host runs `npm install && npm run build`. With nothing to install, that step cannot fail. There is no bundler, framework, or npm package in `dependencies` |
| Plain browser ES modules | No build step. What is in `src/` is what the browser runs, which makes a problem on the live site diagnosable by reading the same file you edit |
| Names encrypted, never in the repository | The repository and the site are public and most of the roster are minors. See §10 |
| Shared storage on the website | One schedule, not one per browser. See §8 |
| The rule engine never blocks you | The tool reports; it does not overrule the person. See §6 |

---

## 2. Getting in

### The address

The site is a normal web page. Open it in any current browser; nothing to install. It works on a
phone, where the three columns stack vertically.

### The password gate

On first visit a dialog asks for the **shared password**. One password for everyone — there are no
individual accounts.

| What you do | What you get |
|---|---|
| Enter the password | Real names, and the schedule saved on the website and shared with everyone |
| **Continue without names** | The schedule still loads and is fully editable, but people show as role codes (`TG-1`, `ASPL-QM`) and **your changes are saved only in your own browser** |

The password is cached in `sessionStorage` — it survives a reload but not closing the tab. It is
scoped to the hostname, so moving the site to a new address makes everyone enter it once more.

**The password is the only thing protecting the names.** Hand it over in person or in a channel you
already trust. It is deliberately absent from the printed staff card.

**HTTPS is required.** Name decryption uses WebCrypto, which browsers expose only on secure
origins. On plain `http://` the page loads but the gate cannot succeed at all; the error says
`This page needs HTTPS (or localhost) to decrypt names`. The live site redirects, so this only
bites on a hand-typed address.

### URL parameters

Append to the address, e.g. `?event=SD3`:

| Parameter | Effect |
|---|---|
| `?event=<ID>` | Open a specific event — `SD1`…`SD4`, `W1`, `W2` |
| `?local` | Never contact the server; use browser-only storage. For local development |
| `?nogate` | Skip the password dialog. Names stay locked; useful for demos and automated tests |

---

## 3. The screen

Three columns on a desktop, stacked top-to-bottom on a phone.

### 3.1 Header (top bar)

Left to right:

| Control | What it does |
|---|---|
| **Event dropdown** | Switch between SD1–SD4, W1, W2. The app opens on an event that has content, never an empty one, and remembers the last one you looked at |
| **All days / One day** | Show every day of the event side by side, or one at a time. "One day" adds a second dropdown to pick which |
| **Issues button** | Reads `No issues`, or `N red · N amber`. Click to open the Issues tab. Turns red or amber to match |
| **? Help** | The in-app guide, and the button that prints the one-page staff card |
| **Undo / Redo** | Up to 200 steps. Also `Ctrl/Cmd-Z` and `Ctrl/Cmd-Shift-Z`. Covers placements, custom activities and task status |
| **Save JSON** | Download the whole schedule as a file |
| **Load JSON** | Load a schedule file, **replacing** everything on screen. See the warning in §9 |
| **Export ▾** | Four outputs; see §7 |
| **🔒 Unlock names / 🔓 Names on · Lock** | Enter the password, or forget it on this device |
| **Save indicator** | The most important thing in the header; see §8 |

### 3.2 Left rail — the catalog

Everything that can be scheduled. **It is a catalog, not a to-do list**: dragging an item out never
consumes it, which is why `lunch` can appear eleven times across the course.

| Control | What it does |
|---|---|
| **Search box** | Matches name, tags **and** notes, as a substring. Searching `sd3` finds items tagged `sd3` *and* items merely mentioning it |
| **Type chips** | All · Presentations · Meals · Ceremonies · Meetings · Outpost · Games & activities · Logistics · Staff tasks · Other |
| **Only not yet placed in this event** | Hides anything already on the current event's canvas |
| **Hide finished tasks** | Hides staff tasks marked done. This is what makes a 133-item list shrink as the team works |
| **Status circle** | On staff tasks only. One tap marks done, another reopens. See §5 |
| **+ Quick activity** | Add something that is not in the catalog; see §4.4 |

Each row shows the name, the duration, and badges: `TG / patrol`, `flag`, `soft`, `practice SD2`,
and `placed 3×` when it is already on the current event.

### 3.3 Centre — the canvas

One section per day of the event. Time runs down the left in 15-minute rows. Lanes run across.

**Lanes.** Each event has three:

| Event | Lanes |
|---|---|
| SD1–SD4 | **All Hands** · TG & Presenters · Quartermasters |
| W1, W2 | **Troop (main hall)** · Patrols (TG) · Quartermasters |

The first lane of each event is an **all-hands lane**. A block in it spans the full width and
**blocks every other lane for its duration**. That is the mechanism behind "at meals we are all
together" — it is not a special case for meals, it is what the lane means. The two ordinary lanes
run in parallel, which is how Troop Guides and Quartermasters work on different things at once.

### 3.4 Right panel

Four tabs when nothing is selected. Selecting a block replaces all of it with the block editor.

- **Event** — name, notes, day/lane/placement counts, and **Start from last year** (§4.5)
- **Issues** — every conflict on this event; see §6
- **Progress** — task completion and pace; see §5
- **Practice coverage** — which presentations have a rehearsal slot; see §6.4

---

## 4. Scheduling

### 4.1 Adding something

Drag a row from the left rail onto a lane. A ghost follows the pointer and snaps to 15 minutes;
it shows dashed and faded when the drop would be invalid. Release to place it.

Dragging uses pointer events, so it works identically with a mouse, a trackpad, a finger or a
stylus.

### 4.2 Moving, resizing, removing

| Action | How |
|---|---|
| Move | Drag the block. Across lanes and across days |
| Resize | Drag the bottom edge |
| Select | Click it. The right panel becomes its editor |
| Nudge 15 minutes | `↑` / `↓` |
| Nudge one hour | `Shift` + `↑` / `↓` |
| Change lane | `←` / `→` |
| Delete | `Delete` or `Backspace` |
| Deselect | `Esc` |

Everything snaps to 15 minutes. Times are camp-local minutes since midnight — no timezones, no
daylight-saving arithmetic.

### 4.3 The block editor

With a block selected:

- **Day** and **Lane** dropdowns
- **Start** time and **Minutes**, showing the catalog default when you have overridden it
- **People** — checkboxes by team (senior, adult, qm, tg). Shows names when unlocked, role codes otherwise
- **Override** — silences the TG-delivery warning for this block only
- **Status** — on staff tasks only; see §5
- **Notes** — free text, carried into exports and the printout
- **Remove from schedule** / **Close**

### 4.4 Quick activity

**+ Quick activity** at the bottom of the rail, for something not in the catalog. Asks for name,
minutes, type and audience. It is stored **in the schedule, not the content pack**, and is never
written back to the source workbook. Its id is generated from the name.

Keep real people's names out of these titles. They print on the run of show and travel in every
export.

### 4.5 Start from last year

In the **Event** tab. Copies one of last year's day layouts onto a day of the current event — six
are included, `26-1 Day 1` through `Day 6`, holding 13 to 25 items each. Items that fall outside
the day's hours are skipped. Undo reverts the whole thing in one step.

---

## 5. Tasks, status and pace

Most staff work never sits on a clock. Of 127 Quartermaster tasks in the pack, 108 are still
backlog — "order patches", "reconcile inventory" — rather than timed sessions. They live in the
rail with a status instead of on the canvas.

### 5.1 The four states

| Status | Circle | Means |
|---|---|---|
| `todo` | empty | Nobody has started. The default; absent from storage entirely |
| `doing` | blue | In progress |
| `blocked` | red | Waiting on something or someone. Carries a short reason |
| `done` | green | Complete. The row is struck through |

Only activities of type `staff_task` carry a status. Presentations, meals and ceremonies are events,
not work items.

### 5.1.1 Known limitation: recurring tasks share one status

Status is keyed by **activity id**, so an activity placed several times has **one** status covering
all of them. For most tasks that is right — they happen once. It is wrong for anything recurring,
and the schedule now has three:

| Activity | Placed | Why |
|---|---|---|
| `qm-work-block` | 17× | A generic work block on every weekend, not a discrete task |
| `qm-daily-morning-gear-check-flags-ceremonies-program` | 3× | Once each morning of W1 |
| `qm-daily-deliver-retrieve-midday-restock-evening-reset` | 2× | Twice across W1 |

Two consequences. Marking Friday's gear check done also marks Saturday's and Sunday's. And the
Progress tab counts each of these as **one** task rather than one per occurrence, so the totals
understate the real workload by roughly twenty placements.

Nothing is lost or corrupted — the schedule itself is unaffected, and the status is simply coarser
than the work. The fix is to key status by placement id for activities that are placed more than
once; it is not implemented.

### 5.2 Setting it

- **One tap** on the circle in the rail toggles done ↔ todo. This is the motion designed for a phone
- **The block editor** gives all four states, who is doing it, and the blocked reason

**Who is recorded as a role id** (`QM-YOUTH`, `ASPL-QM`), never a typed name. The roster turns it
into a display name on screen; the stored file and every export carry only the role.
`npm run check:schedule` rejects a value that is not in `resources.csv`.

### 5.3 The Progress tab

Leads with **pace**, not a raw count, because "12 of 133" discourages and "12 ahead" does not.

- **Ahead / behind** — tasks finished with a deadline, minus tasks whose deadline has passed
- Completion count, percentage, and hours done against hours total
- **The next weekend** that still has unfinished work, and how many days away it is
- **By weekend** — done, left, and hours left for each

**Deadlines are derived, never maintained.** Each task's weekend tag resolves against the event
dates: `before-sd2` falls due when SD2 **starts**, since the point is that it is finished before
anyone arrives; `sd2` falls due when SD2 **ends**. Work tagged `post-course` has **no** deadline
rather than an invented one, and is excluded from pace so finishing it early cannot flatter the
number.

---

## 6. The rule engine

Evaluated continuously. **Nothing is ever refused** — a drop that causes a clash lands anyway and
turns red. Sometimes the clash is deliberate and the person is the one who knows that.

Severities: **hard** (red) and **soft** (amber). Some findings are *quiet* — real, but not painted
on the canvas, because they concern things not yet placed.

### 6.1 The eight rules

| Rule | Severity | Fires when |
|---|---|---|
| `resource_double_booked` | hard | One person is on two overlapping placements, across any lanes |
| `outside_event_bounds` | hard | A placement is on a day the event does not have, or runs outside that day's hours |
| `track_overlap` | hard | Two blocks overlap in the same lane, or one is in the all-hands lane |
| `lock_slot` | hard or soft | A locked activity is on the wrong day or outside its time window |
| `delivery_mismatch` | soft | A TG/patrol module sits in an all-hands lane |
| `syllabus_day_order` | soft | A presentation runs on a course day earlier than its syllabus day |
| `ready_gate` | soft, quiet | A presentation is on the course but not marked Ready in the source workbook |
| `practice_uncovered` | soft, quiet | A presentation has no rehearsal slot, or is not placed in its assigned Practice SD |

### 6.2 The two escape hatches

Both are per-block, visible to whoever looks next:

- **Override** — "this TG module is in the main hall on purpose"
- **overlap-ok** — "this parallel work is deliberate"

### 6.3 This pack's locked slots

| Constraint | Severity | Rule |
|---|---|---|
| Outpost | hard | Saturday of W2, arrival by 15:00 — patrols navigate there by GPS in the afternoon |
| Participants arrive | hard | W1 Saturday 08:00–09:00. Nothing for participants before then |
| Inspirational campfire | soft | W2 Friday, 20:00–21:00 |

### 6.4 Practice coverage

A matrix of every syllabus presentation against SD1–SD4. `✓` placed, `✗` assigned but not placed,
`?` no Practice SD assigned at all. Click any cell to jump to that weekend.

**An empty matrix is expected, not a bug.** `Practice SD` is blank for every presentation until the
Course Director fills it in and the catalog is re-imported.

---

## 7. Getting data out

**Export ▾** in the header:

| Output | What it is |
|---|---|
| **Run-of-show CSV (this event)** | One row per placement: event, day, date, weekday, start, end, 24h start, minutes, activity, type, lane, all-hands, people, delivery, location, notes, issues |
| **Authority sheet sync CSV** | Changes to push back into the Presentations Authority workbook, including Practice SD inferred from where things are placed |
| **Print / Save as PDF (this event)** | The weekend on screen: one table per day, all-hands rows shaded, ⚠ on anything with a conflict |
| **Print all weekends (N)** | Every weekend with something scheduled, each starting on a fresh sheet so the stack can be split. Weekends with nothing on them are named on the cover rather than printed blank. The count in the label tells you how many will print |

The printout header records whether names were locked when you printed.

The **? Help** overlay also prints a **one-page staff card** — the right thing to hand to youth
staff at a weekend. It carries no password.

**Print before you leave for camp.** Signal there is poor and paper needs no password.

---

## 8. Saving and sharing

### 8.1 How it works

The schedule lives in one file on the website, not in your browser. It saves itself about a second
after you stop editing. Another person's changes reach you within about twenty seconds — but only
while you have nothing unsaved, so an edit in progress is never pulled out from under you.

### 8.2 The save indicator

| It says | Meaning |
|---|---|
| `✓ saved to site` | Shared. Everyone with the password sees it |
| `● saving soon` / `saving to site…` | In flight |
| `⚠ not saved — retrying` | The site is unreachable. Work continues locally; it retries every 15 seconds |
| `⚠ conflict — see banner` | Someone saved first; see below |
| **`browser only`** | **Not shared.** No password entered, or the site is unreachable |

`browser only` is the one that matters. Your work is in that browser alone and nobody else will
ever see it.

### 8.3 Two people at once

Every save carries the version it was based on. A stale save is refused with HTTP 409 and the
current document, rather than overwriting. The second person gets a banner:

- **Use theirs (discard mine)**
- **Keep mine (overwrite)**
- **Save mine to a file first**

Nobody is silently overwritten, and no change is lost without somebody choosing to lose it.

### 8.4 Save JSON is not a required backup

The site is the record. **Save JSON** is for handing a copy to someone, or keeping a snapshot.

---

## 9. Loading a file — the one destructive action

**Load JSON replaces everything.** It does not merge. A file containing `"placements": []` will
replace a full schedule with nothing, and the push to the server is forced, so it overwrites the
shared copy too.

Before loading anything you did not just export:

```
npm run check:schedule -- <file>
```

It reports blocking problems, warnings, and what the conflict engine would show afterwards. A file
without `"format": "program-scheduler/schedule"` is refused by the app outright.

---

## 10. Names and youth protection

Most of the roster are minors, and both the repository and the site are public. The design follows
from that.

| Where | What is there |
|---|---|
| `roster.local.csv` | Real names. Gitignored. **Never read or print this file** |
| `public/roster.enc` | AES-256-GCM ciphertext, key from PBKDF2-SHA256 at 210,000 iterations |
| Everywhere else | Role ids only — `TG-1`, `ASPL-QM`, `QM-YOUTH` |

Managing names without exposing them, via `npm run roster`:

| Command | Does | Prints names? |
|---|---|---|
| `pull` | Decrypt to `roster.local.csv` | writes a file |
| `push` | Encrypt back to `roster.enc` | no |
| `list` | Every role and whether it is named | **no** |
| `check` | Coverage, and whether `roster.enc` is stale | **no** |
| `set <id> "<name>"` | Rename one person and re-encrypt | no |
| `unset <id>` | Clear one person | no |
| `show` | The only command that prints names, and it asks you to confirm | **yes** |

`list` and `check` are safe to run in front of someone, or inside an AI session.

`npm run check:names` refuses to let a real name reach the repository, in two layers: a structural
check that needs no secrets and runs in CI, and a full scan on a machine that has the roster.
`npm run install-hooks` makes it a pre-commit gate. **Git history is permanent — a name committed
once is committed forever.**

### For an AI assistant working on this project

1. **Never read or print `roster.local.csv`.** Anything read lands in a transcript. Use `npm run roster -- list` / `-- check`
2. Never commit a real person's name, in code, comments, test fixtures or documentation
3. Treat `scripts/scrub.local.txt` the same way
4. Role ids are always the right answer when something needs to refer to a person

---

## 11. Running and maintaining it

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Serve at http://localhost:3000. Names work here without HTTPS — localhost is a secure origin |
| `npm run check` | **The gate.** Lint, pack validation, name guard, tests. Run before every commit |
| `npm run check:pack` | Referential integrity across the pack CSVs |
| `npm run check:names` | Nothing name-shaped is committed |
| `npm run check:schedule -- <file>` | Validate a schedule file before importing |
| `npm test` | Unit tests |
| `npm run build` | Copy deployable files into `dist/` |
| `npm run roster -- <cmd>` | Manage names (§10) |
| `npm run api-password` | Regenerate `api/config.php` after a password change |
| `npm run import-catalog` | Rebuild `activities.csv` from the source workbooks |
| `npm run import-qm-tasks` | Convert the hand-authored QM task list into catalog rows |
| `npm run cache-bust` | Move every app URL to a new cache key |
| `npm run install-hooks` | Install the pre-commit name guard |

### Code map

```
index.html  src/
  config.js        grid constants, PACK_ID, ASSET_V
  pack.js          loads a content pack; computeDays() clips days to event bounds
  state.js         in-memory state, undo/redo, the only mutators
  canvas.js        rendering
  drag.js          all pointer-event dragging and keyboard nudging
  conflicts.js     pure rule engine + coverage matrix
  progress.js      pure task roll-up: done, blocked, how far ahead of pace
  catalog.js       left rail
  editor.js        block editor, quick activity, task status control
  help.js          the ? overlay and the one-page staff card
  roster.js        WebCrypto decrypt; caches the password, not the roster
  store/           apiStore.js (the site) · localStore.js (offline fallback)
  export/          run-of-show CSV, Authority sync CSV, print view
api/placements.php shared storage; version-checked writes, password on every request
packs/nylt-27-1/   five CSVs + templates.json
```

`conflicts.js` and `progress.js` are **pure** — no DOM, no state import — so tests and a future
server can call them. `npm run lint` enforces it.

### Deployment

Deploys from `main`, serving the repository root. A redeploy must not wipe `api/data/`, which holds
the live schedule and is in no backup but your own exports. See
[DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md), including the section on changing the domain.

**Cache busting is all-or-nothing.** The app is unbundled ES modules with no content hashing. A new
`main.js` importing a cached old `roster.js` fails with *"does not provide an export named …"* and
the app does not start — worse than uniformly stale. `npm run cache-bust` moves every import,
stylesheet and runtime fetch together. Never hand-edit one.

---

## 12. Troubleshooting

| Symptom | Cause |
|---|---|
| The schedule looks blank | Usually the wrong event. SD1 is deliberately empty. The app says so and names the events that do have content |
| My changes are not reaching anyone | Check the save indicator. `browser only` means no password or no server |
| Names show as `TG-1` | Not unlocked, or the page is on plain `http://` |
| A pushed change has not taken effect | The CDN is serving a cached copy. Flush it; `npm run cache-bust` is the fallback |
| A new domain shows a parked page | DNS points at the host but no website claims the hostname |
| Everyone is suddenly in browser-only mode | Expected for one visit after a domain change — web storage is scoped to the hostname |
| The coverage matrix is empty | Expected until `Practice SD` is filled in and the catalog re-imported |
| The People column prints blank | Nobody is assigned to those blocks yet |

Fuller detail, with the commands that tell you which it is:
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## 13. Data model in brief

```
Activity    id, name, duration_min, type, audience, delivery, group, syllabus_day,
            soft_vs_hard, practice_sd, owner_id, ready, location, tags, notes, source
Resource    id, role, kind, team, sort          — roles, never names
Event       id, name, hard_start, hard_stop, location, notes
Track       id, event_id, name, is_all_hands, sort
Placement   id, activity_id, event_id, track_id, day, start_min, duration_min,
            resource_ids[], flags[], notes
Constraint  id, event_id?, rule_type, params (JSON), severity, description
```

The saved schedule document:

```json
{ "format": "program-scheduler/schedule", "version": 75, "pack": "nylt-27-1",
  "savedAt": "...", "savedBy": "ACD",
  "placements": [...], "customActivities": [...], "tasks": { ... } }
```

`tasks` is keyed by **activity id**. 63 activities are placed more than once — `lunch` eleven
times — and keying status by placement would have made "done" meaningless for them. That reasoning
held when no staff task was placed twice; three now are, so see the limitation in §5.1.1.

Full field-by-field detail: [DATA-MODEL.md](DATA-MODEL.md).

---

## 14. Things that will bite you

- Selecting a block re-renders the canvas and detaches the element. Read `getBoundingClientRect()` **before** calling `select()`
- `el()` ignores `null` children, but `append(...)` on an array containing `null` inserts the string `"null"` — filter first
- An all-hands lane blocks every other lane. Do not special-case meals; that is already the mechanism
- Several roster surnames are ordinary English words — `Lane` is the worst, since "lane" is the app's core concept. `scripts/common-name-words.txt` is a generic committed allowlist; roster-specific additions go in the gitignored `scripts/scrub.local.txt`. Never move the generic list's contents into a roster-derived one, which would leak the names it protects
- The Authority workbook has no formulas: its four tabs are independent copies that drift. The importer reads three and warns about the fourth
- `api/placements.php` rebuilds the saved document from an **explicit whitelist** on every write. A field missing from that list is silently dropped, and the change appears to save and then vanishes on reload
- The same file decodes JSON with `json_decode($s, true)`, which turns `{}` into an empty PHP array that re-encodes as `[]`. Responses re-cast `tasks` for exactly this reason
- Before handing over a schedule file, run `npm run check:schedule`. Eyeballing one missed a closing event and a dismissal stacked in the same slot
