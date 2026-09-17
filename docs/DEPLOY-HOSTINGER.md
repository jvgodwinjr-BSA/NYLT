# Deploying to Hostinger web hosting

The app is static files (HTML, ES modules, CSV, one encrypted JSON). Hostinger's web hosting serves exactly that. There is no Node process to keep alive; Node is only used by Hostinger to run `npm run build`, which copies the deployable files into `dist/`.

## First time

1. **hPanel → Websites → your site → Import website → GitHub** (on some plans this is **Advanced → Git**). Connect `jvgodwinjr-BSA/NYLT`.
2. **Branch:** deploy **`main`**. Work happens on a feature branch and reaches the site only once merged, so the live site always reflects reviewed, CI-green code. Hostinger deploys one branch.
3. If asked for build settings: build command `npm run build`, Node 18 or newer. **This site serves the repository root, not `dist/`** — verified against the live site, where `/package.json` and `/CLAUDE.md` return 200 and `/dist/index.html` is 404. That is why the root `.htaccess` is the one in force. `npm run build` and `dist/` remain useful for the manual upload path below; if you ever set a publish directory, `dist` is the one to use, and the `.htaccess` inside it applies instead.
4. **SSL:** turn on the free certificate (hPanel → Security → SSL). **HTTPS is required** — the browser only exposes WebCrypto, which decrypts the roster, on secure origins.
5. Open the site. You should see the password gate; enter the shared password to see names, or continue without.

## Changing the site's domain

Done once already, moving off the generated `*.hostingersite.com` name. The trap is that the
obvious-looking actions do nothing and the correct one is easy to miss.

**The symptom of getting it wrong:** the new hostname resolves, and serves Hostinger's
*"Parked Domain name on Hostinger DNS system"* page. That page does not mean DNS is broken — it
means the hostname points at Hostinger but **no website in hPanel claims it**. Adding a DNS record
or a domain alias does not create that binding. Neither does anything on the domain's side.

**The operation you want is "change this website's domain", never "add a website."**

1. Back up first: **Save JSON**, or `GET api/placements.php` with the password. Add the
   `"format": "program-scheduler/schedule"` envelope if you took the raw API response — Load JSON
   refuses a file without it, so an unwrapped backup is not restorable.
2. hPanel → **Websites** → the site → **Dashboard** → **Change Website Domain** (under Domains on
   some plans, a dashboard card on others).
3. Issue SSL for the new hostname (**Security → SSL**).
4. **Performance → CDN → Flush cache**, so no edge keeps serving the parked page.

**Why it must be a rebind and not a new site.** The live schedule is `api/data/<pack>.json` on the
server. It is gitignored, kept out of `dist/`, and blocked from direct fetch — **nothing in git
holds a copy**. Rebinding keeps the same document root, so the file is simply still there.
Creating a second website gives you a new, empty document root and strands everyone's work in the
old folder. If a rebind is not offered and you must create a subdomain, only do it if the form
lets you set a **custom document root** pointing at the existing site's folder.

**SSL is a blocker, not a nicety.** WebCrypto is only available on secure origins, so on plain
HTTP the site loads but nobody can unlock names or reach the shared schedule
(`src/roster.js` throws `This page needs HTTPS (or localhost) to decrypt names`). Confirm
`http://` 301s to `https://` before telling anyone the new address.

**Tell people they will re-enter the password once.** sessionStorage is scoped to the hostname, so
the cached password, the offline fallback copy and the last-event memory all start empty at the
new address. Until someone types the password the app sits in `browser only` mode, which reads
exactly like the site being broken. Anyone holding unsaved browser-only changes at the old
hostname cannot reach them from the new one — have everyone confirm **✓ saved to site** first.

Afterwards, verify against the new origin: the title is `Program Scheduler` rather than the parked
page, the certificate verifies, the pack serves its full activity count, the schedule reports the
same placement count as your backup, `api/data/*.json` is 403 and `api/placements.php` without a
password is 401. Hostinger retires the old generated hostname on rename — it starts returning 403.

## Optional second lock

hPanel → **Security → Password Protect Directories** on the site root. That is server-side HTTP Basic auth: nothing is served to anyone without the password, on top of the in-app roster gate. Costs nothing; recommended.

## Updating

Merge to `main` and push; Hostinger redeploys. If auto-deploy is off, press **Deploy** in the Git panel.

## Caching — read this before concluding a push did not work

Hostinger fronts the site with a CDN and, by default, served JavaScript with `Cache-Control: public, max-age=604800` — a week. A pushed fix would not reach anyone already running the old copy.

The committed root `.htaccess` replaces that with `no-cache, must-revalidate` for html/js/css/csv/json, `no-store` for PHP and the roster, and a day for images. It applies to anything fetched from then on, but **cannot evict what the CDN already stored**.

**To flush:** Hostinger dashboard → Websites → **Dashboard** next to the site → **Performance → CDN** → **Flush cache**. Effective within seconds. Do not click *Disable* — that turns the CDN off and rewrites DNS.

**To check whether a file is stale**, every response carries Hostinger's own header:

```
curl -sSD- -o/dev/null https://YOUR-SITE/src/main.js | grep -iE 'cache-control|x-hcdn'
```

`HIT` with `max-age=604800` is the old policy still cached; `MISS` or `no-cache` is current.

**If flushing is not enough**, `npm run cache-bust` moves every module URL, stylesheet and runtime fetch to a `?v=` the CDN has never seen. It must be all of them at once — see rule 7 in [CLAUDE.md](../CLAUDE.md).

Note the LiteSpeed **Cache Manager** in hPanel is a *separate* cache from the CDN; clearing one does not clear the other. Stale page text points at Cache Manager, stale behaviour at the CDN.

## If the importer misbehaves

`npm run build`, zip the contents of `dist/`, upload to `public_html` with hPanel's File Manager. The site works from any subfolder too — all paths are relative.

## Changing the password / names

Edit `roster.local.csv` (never committed), run `npm run encrypt-roster`, commit the new `public/roster.enc`, push. Everyone who had the old password needs the new one; the sessionStorage cache clears when the tab closes.

## Shared editing

`api/placements.php` stores the schedule on the site, so everyone with the password edits one plan. It needs nothing beyond what Hostinger already provides: PHP, and a writable directory.

- `api/config.php` carries a PBKDF2-SHA256 salt and hash of the shared password. Regenerate it with `npm run api-password` whenever the password changes, then commit and push.
- `api/data/` holds one JSON file per pack. It is gitignored and blocked from direct fetch by `api/data/.htaccess`, so it is only ever reachable through the PHP.
- **The data directory must be writable by PHP.** If saving reports `api/data is not writable`, set that folder to 755 (or 775) in hPanel's File Manager.
- **A redeploy must not wipe `api/data/`.** A git *pull*-style sync leaves untracked files alone, which is what you want. If your deploy wipes and re-copies the whole folder, the live schedule would be lost — keep periodic **Save JSON** exports in Drive as insurance, and confirm after your next deploy that the schedule survived.
- Concurrency is handled with a version number: a save based on a stale version is refused with 409 and the person is offered their choices, rather than one of them losing work silently.
