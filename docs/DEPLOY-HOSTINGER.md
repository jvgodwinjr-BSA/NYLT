# Deploying to Hostinger web hosting

The app is static files (HTML, ES modules, CSV, one encrypted JSON). Hostinger's web hosting serves exactly that. There is no Node process to keep alive; Node is only used by Hostinger to run `npm run build`, which copies the deployable files into `dist/`.

## First time

1. **hPanel → Websites → your site → Import website → GitHub** (on some plans this is **Advanced → Git**). Connect `jvgodwinjr-BSA/NYLT`.
2. **Branch:** deploy **`main`**. Work happens on a feature branch and reaches the site only once merged, so the live site always reflects reviewed, CI-green code. Hostinger deploys one branch.
3. If asked for build settings: build command `npm run build`, output/publish directory `dist`. Hostinger usually detects `dist` on its own. Node version: 18 or newer.
4. **SSL:** turn on the free certificate (hPanel → Security → SSL). **HTTPS is required** — the browser only exposes WebCrypto, which decrypts the roster, on secure origins.
5. Open the site. You should see the password gate; enter the shared password to see names, or continue without.

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
