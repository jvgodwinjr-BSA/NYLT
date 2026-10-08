# Using the scheduler

For the people who use the site rather than build it. If you only need to find your jobs and tick
them off, you do not need this page — open the site and press **? Help**, which is shorter and is
the same text that prints onto the one-page staff card.

## What it is

One shared plan for the whole course. Everyone with the password sees the same copy, and a change
you make reaches everyone else within about twenty seconds. There is no "my version".

Six events: **SD1–SD4** (staff development weekends) and **Course Weekend 1** and **2**. Pick one
from the dropdown at the top left; the app opens on one that has something in it.

## The three columns

**Left — the catalog.** Everything that can be scheduled: presentations, meals, ceremonies, games,
and 133 staff tasks. It is a catalog, not a to-do list — dragging something out never uses it up,
so `lunch` can be placed eleven times.

Filter with the type buttons, or search. Search looks at names, tags and notes, so `sd3` finds
everything tagged for SD3 **and** anything that mentions it.

**Middle — the day.** A 15-minute grid, one section per day, with lanes side by side:

| Lane | Who |
|---|---|
| **All Hands** | Everyone. Meals and ceremonies. Spans every other lane |
| **TG & Presenters** | Troop Guides and the presentation team |
| **Quartermasters** | The QM crew, working on something else at the same time |

An All Hands block blocks every other lane. That is the mechanism behind "at meals we are all
together" — it is not a special case for meals, it is what the lane means.

**Right — the details.** Four tabs: **Event**, **Issues**, **Progress**, **Practice coverage**.
Click a block and this panel becomes the editor for it.

## Scheduling

Drag from the left rail onto a lane. Drag a block to move it, or its bottom edge to resize. Arrow
keys nudge a selected block 15 minutes, Shift-arrow an hour, left and right change lane, Delete
removes, Esc closes.

**Nothing is ever refused.** A drop that causes a clash lands anyway and turns red. The tool
reports; it does not overrule you — sometimes the clash is deliberate and you are the one who
knows that.

### Red and amber

The **Issues** tab lists them. Red is a hard problem, amber is worth a look.

| What it means | Typical fix |
|---|---|
| A person is in two places at once | Take them off one block, or move it |
| A block runs outside the weekend's hours | Move it inside the day |
| Two things overlap in one lane | Move one, or tick **Overlap is deliberate** on the block |
| A TG module is in the main hall | Move it to the TG lane, or tick **Override** if that is intended |
| A presentation has no rehearsal slot | Place it in an SD weekend — see **Practice coverage** |

Two escape hatches exist because the tool is sometimes wrong: **Override** silences the
TG-delivery warning for one block, **Overlap is deliberate** silences the lane clash. Both are per
block and visible to whoever looks next.

## Tasks and progress

Most of the staff workload is not on the clock — most of the 127 Quartermaster tasks are backlog,
not timed sessions. They live in the rail with a status instead.

Set it from the circle on a rail row (one tap to finish, one to reopen), or from the block editor
where you can also record who is doing it and what a blocked task is waiting on.

| Status | Means |
|---|---|
| empty circle | Nobody has started |
| blue | In progress |
| red | Blocked — waiting on something or someone |
| green | Done |

**The Progress tab leads with pace, not a count.** It compares what is finished against what the
calendar actually needed by today, and says how far **ahead** the team is. Deadlines come from each
task's weekend tag and the event dates, so there is nothing to maintain.

Work tagged for after the course has no deadline and is left out of the pace figure, so finishing
it early cannot flatter the number. The by-weekend table underneath shows where the pressure is —
SD3 wants about 40 tasks inside one weekend, which is why working ahead matters.

**Who did it is recorded as a role, never a name** — `QM-YOUTH`, `ASPL-QM`. The roster turns that
into a name on screen for anyone who has unlocked it; what gets stored and exported is the role.

## Saving

It saves itself, about a second after you stop. The indicator at the top right is the thing to
watch:

| It says | Meaning |
|---|---|
| `✓ saved to site` | Shared. Everyone with the password sees it |
| `● saving soon` / `saving to site…` | In flight |
| `⚠ not saved — retrying` | The site is unreachable. Work continues locally; it retries |
| `⚠ conflict — see banner` | Someone saved first. Choose Use theirs / Keep mine / Save mine to a file |
| **`browser only`** | **Not shared.** No password entered, or the site is unreachable |

`browser only` is the one that matters. It means your work is in that browser alone and nobody
else will ever see it.

**Save JSON** is not a backup you are required to take — it is for handing a copy to someone or
keeping a snapshot. The site is the record.

## Loading a file

**Load JSON replaces everything** — it does not merge, and it pushes the result to the site, so it
overwrites what everyone else sees. It is the only button here that can destroy work.

The app checks the file first. A clean one loads straight through; anything else stops at a report:

| What it finds | What you see |
|---|---|
| Nothing wrong | Loads, no dialog |
| Warnings | *Check this before loading* — times off the 15-minute grid, a file for another pack |
| Blocking problems | *This file has problems* — a lane or activity that does not exist, missing fields |
| Fewer placements than you have | *This removes N placements*, and the confirm button reads **Replace and lose N** |

Cancel is the default and `Esc` does the same. **Save mine to a file first** exports your current
schedule without closing the dialog.

That last row matters most: a file containing no placements is perfectly valid and will wipe
everything, for everyone. Being correct and being safe are different things.

If you keep a checkout, you can run the same checks before you even open the site:

```
npm run check:schedule -- ~/Downloads/the-file.json
```

It exits 0 when the file is safe and 1 when it is not, and it previews the conflicts you would see
after loading.

## Two people at once

Whoever saves first wins. The second person gets a banner offering **Use theirs**, **Keep mine**,
or **Save mine to a file first**. Nobody is silently overwritten, and no change is lost without
somebody choosing to lose it.

Other people's changes arrive within about twenty seconds — but only while your own browser has
nothing unsaved, so an edit in progress is never yanked out from under you.

## Names

Enter the password and people appear by name; without it you get role codes like `TG-1`, and the
schedule is browser-only. The names themselves are encrypted, and the site is public, so **the
password is what protects them**. Do not put it in a group chat, on the printed card, or in an
email — hand it over in person or in a channel you already trust.

If you are on plain `http://` rather than `https://`, names cannot be decrypted at all. The site
redirects, so this only bites on a hand-typed address.

## Getting it out

**Export** gives three things:

- **Run-of-show CSV** — the weekend you are looking at, as a spreadsheet.
- **Authority sheet sync CSV** — updates back into the Presentations Authority workbook.
- **Print / Save as PDF (this event)** — the run of show for the weekend on screen, one table per day.
- **Print all weekends** — every weekend that has something scheduled, each starting on a fresh
  sheet so the stack can be split and handed out per weekend. A weekend with nothing on it is left
  out and named on the cover rather than printed as a blank page.

Print before you leave for camp: the signal is poor and paper does not need a password. The
**People** column stays empty until somebody is assigned to a block, so an early printout is a
timetable rather than a duty roster — which is what you want while staffing is still being decided.

The **? Help** overlay also prints a one-page staff card, which is the right thing to hand to youth
staff at a weekend.
