# Troubleshooting

Things that have actually gone wrong, and what they turned out to be. Start here before assuming something is broken — twice now the answer was "it is working, you are looking at the wrong thing".

## "The schedule is blank"

**First: check which event you are on.** The picker is top-left. An event with nothing in it renders an empty grid, which looks exactly like a failed import. SD1 is intentionally empty, and the app used to open on it.

The app now opens on an event that has content, and remembers the last one you looked at. If a canvas really is empty it says so in a box and names the events that do have a schedule.

**To confirm the server has your data**, not just your browser:

```
curl -H "X-Schedule-Password: YOUR-PASSWORD" \
  "https://YOUR-SITE/api/placements.php?pack=nylt-27-1" | head -c 300
```

`"placements":[]` means the server is genuinely empty. Anything else means the data is there and the problem is on screen.

## "My changes are not showing up for the other person"

Check the header indicator:

| It says | Meaning |
|---|---|
| `✓ saved to site` | Shared. Everyone with the password sees it. |
| `saving to site…` / `● saving soon` | In flight; give it a second. |
| `⚠ not saved — retrying` | The site is unreachable. Work continues locally; it retries every 15s. |
| `⚠ conflict — see banner` | Someone else saved first. The banner offers Use theirs / Keep mine / Save mine to a file. |
| `browser only` | **Not shared.** No password entered, or the API is unreachable. |

`browser only` is the one to watch for. It means your work is in this browser alone. Enter the password (🔒 Unlock names) to connect.

The other person's changes arrive within about 20 seconds, but **only while you have nothing unsaved** — an edit in progress is never yanked out from under you.

## "I pushed a change but the site still behaves the old way"

Hostinger's CDN caches static files, and its default was a week. The committed `.htaccess` now sends `no-cache, must-revalidate`, so this should not recur — but a generation cached under the old policy can persist.

1. **Flush the CDN**: Hostinger dashboard → Websites → **Dashboard** next to the site → **Performance → CDN** → **Flush cache**. Takes effect within seconds. (Do not click *Disable* — that turns the CDN off and rewrites DNS.)
2. **Hard-refresh**: Cmd/Ctrl + Shift + R.
3. If it persists, move every app URL to a cache key the CDN has never seen:
   ```
   npm run cache-bust        # bumps ?v= on every import, stylesheet and data fetch
   git commit -am "Bust cache" && git push
   ```

**Check whether a file is stale** — every response carries Hostinger's cache header:

```
curl -sSD- -o/dev/null https://YOUR-SITE/src/main.js | grep -iE 'cache-control|x-hcdn'
```

`x-hcdn-cache-status: HIT` with `max-age=604800` is the old policy still cached. `MISS` or `no-cache, must-revalidate` is current.

**Bust the whole graph or none of it.** The app is unbundled ES modules: a new `main.js` importing a stale `roster.js` fails outright with *"does not provide an export named …"*. `npm run cache-bust` moves every URL together for exactly this reason.

## "The new domain shows a Hostinger parked page"

You will see *"Parked Domain name on Hostinger DNS system"*. **DNS is not the problem** — confirm
it by resolving the new hostname and the site's current one; they will return the same Hostinger
edge IPs. The page means the hostname points at Hostinger but **no website in hPanel claims it**.

Adding a DNS record or a domain alias does not create that binding. Use the site's own
**Change Website Domain**, per [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md#changing-the-sites-domain)
— and read the warning there about `api/data/` before creating any new website.

## "Everyone is suddenly in browser-only mode"

Expected for one visit after a domain change, and nothing is lost. sessionStorage is scoped to the
hostname, so the cached password does not follow the site to a new address. Everyone enters the
shared password once; the schedule itself lives on the server and is untouched.

If it persists *after* entering the password, check that the new address is really on HTTPS —
WebCrypto, which decrypts the roster, only exists on secure origins, and on plain HTTP the gate
cannot succeed at all. `curl -sI http://YOUR-SITE/` should show a 301 to `https://`.

## "Names show as TG-1 instead of real names"

You are not unlocked. Click **🔒 Unlock names** and enter the shared password. Without it the app works fine but shows role codes, and the schedule is browser-only.

If the password is rejected on a page that loads over plain `http://`, that is the cause: decryption uses WebCrypto, which browsers only expose on HTTPS (and localhost). Make sure Hostinger's SSL is on.

## "A schedule file will not import"

Validate it before loading:

```
npm run check:schedule -- path/to/schedule.json
```

It reports three things separately: **BLOCKING** (cannot load), **WARNING** (loads but wrong — off the 15-minute grid, outside the event's hours), and what the conflict engine would then show. Red blocks are the app working, not an import failure.

Common causes: a lane id that does not exist (course weekends have `-all`, `-patrol`, `-qm` — there is no `-troop`), an activity id that is not in the pack, or a custom activity missing `delivery` / `soft_vs_hard` / `tags`.

## "Saving fails with api/data is not writable"

PHP cannot write the data directory. In hPanel's File Manager set `api/data` to 755 (or 775).

## "The live schedule vanished after a deploy"

A git-pull-style sync leaves untracked files alone, which is why `api/data/` survives — verified on this site. A deploy that wipes and re-copies the whole folder would not. Keep occasional **Save JSON** exports in the shared Drive folder; that file is the only copy of the plan you control.

## Nothing here matches

```
npm run check
```

Runs lint, pack validation, the name guard and all tests. If that passes, the code is sound and the problem is configuration or caching.
