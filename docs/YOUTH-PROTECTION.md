# Youth protection and personal data

This project schedules a Scouting course. Most of the people on the roster are minors, and both the repository and the deployed site are public. This page is the rule for where their information may and may not go. It is short on purpose — please read all of it.

## The rule

**No real name, contact detail, address, or photo of any participant or staff member is ever committed to this repository.**

Not in a CSV, not in a comment, not in a commit message, not in an issue, not in a screenshot. This holds for adults too — adult names are lower risk, not no risk, and a single rule is easier to follow than a graded one.

## Where information is allowed to live

| Information | Where it lives | Committed? |
|---|---|---|
| Role slots (`TG-1`, `QM-ADULT`, `SPL`) | `packs/*/resources.csv` | **Yes** — these are job titles, not people |
| Schedule (who-does-what by role id) | `packs/*/`, saved JSON files | **Yes** — name-free by construction |
| Real names mapped to roles | `roster.local.csv` | **Never** — gitignored |
| Same names, encrypted | `public/roster.enc` | **Yes** — AES-256-GCM ciphertext only |
| Source spreadsheets (Authority sheet, last year's schedule) | `source/` | **Never** — gitignored; keep them in the shared Drive folder |
| Contact details, addresses, medical, YPT status | Nowhere in this project | **Never** — council systems handle these |

The scheduler owns the clock. The Presentations Authority sheet and council registration own people. Do not blur that line by adding a person's details here "just for convenience".

## Why the history rule matters

Git keeps everything. Committing a name and deleting it in the next commit does not remove it — it stays in the repository's history, in every clone, and in GitHub's servers, and anyone can read it. There is no undo that does not involve rewriting history and force-pushing, which is disruptive and unreliable once others have pulled.

This is why the guard runs *before* the commit rather than after.

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

`list` and `check` are safe to run anywhere, including in front of someone else or inside an agent session — they report coverage without revealing who anyone is. `show` is the only command that prints names, and it makes you confirm.

## Install the guard

```
npm run install-hooks
```

`scripts/hooks/pre-commit` then runs `npm run check:names` on staged files and blocks the commit if a roster name appears. The same check runs in CI, where it falls back to structural checks (no secret files exist there): it verifies the gitignored files are not tracked, `resources.csv` has no name column, every `owner_id` resolves to a role id, and `roster.enc` is genuinely encrypted.

`git commit --no-verify` skips the hook. Do not.

If a line genuinely has to carry a name — a copyright notice is the realistic case — put `name-guard:allow` in a comment on that line. The exemption is exactly one line wide and shows up in the diff, so it gets reviewed like any other change. It is not for silencing a warning you would rather not deal with.

## If a name is committed by accident

1. **Do not just delete it in a new commit.** That does not remove it.
2. Tell the Course Director and the repository owner straight away.
3. Decide together between rewriting history and force-pushing (workable while the branch is small and unmerged), or making the repository private.
4. If the information was sensitive beyond a name, follow council guidance for a personal-information disclosure.

## Screenshots, issues, and the deployed site

- Screenshots for an issue or PR: take them **locked** (click "Continue without names") so blocks show role codes.
- Exported PDFs and CSVs *do* contain names when you are unlocked. They download to your machine — do not attach them to an issue or paste them into a public channel.
- The shared password is not a secret you may post next to the site link. Send it separately, to the people who need it.

## The Scouting frame

Barriers to abuse exist because information and access are how harm starts. A public list of youth names, tied to a named course at a named camp on specific dates, is exactly the kind of information Youth Protection asks us not to publish. Keeping names out of the repository is not paperwork — it is the same instinct as two-deep leadership, applied to data.
