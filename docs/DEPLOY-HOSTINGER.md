# Deploying to Hostinger web hosting

The app is static files (HTML, ES modules, CSV, one encrypted JSON). Hostinger's web hosting serves exactly that. There is no Node process to keep alive; Node is only used by Hostinger to run `npm run build`, which copies the deployable files into `dist/`.

## First time

1. **hPanel → Websites → your site → Import website → GitHub** (on some plans this is **Advanced → Git**). Connect `jvgodwinjr-BSA/NYLT`.
2. **Branch:** the work is on `claude/sweet-goodall-x0tmop`. Point Hostinger at that branch to preview it, or merge to `main` and deploy `main`. Hostinger deploys one branch.
3. If asked for build settings: build command `npm run build`, output/publish directory `dist`. Hostinger usually detects `dist` on its own. Node version: 18 or newer.
4. **SSL:** turn on the free certificate (hPanel → Security → SSL). **HTTPS is required** — the browser only exposes WebCrypto, which decrypts the roster, on secure origins.
5. Open the site. You should see the password gate; enter the shared password to see names, or continue without.

## Optional second lock

hPanel → **Security → Password Protect Directories** on the site root. That is server-side HTTP Basic auth: nothing is served to anyone without the password, on top of the in-app roster gate. Costs nothing; recommended.

## Updating

Push to the deployed branch; Hostinger rebuilds. If auto-deploy is off, press **Deploy** in the Git panel.

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
