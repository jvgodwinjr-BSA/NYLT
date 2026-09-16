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

## Shared editing later

Hostinger web hosting runs PHP. When you want the Course Director and ACD on one live schedule, add `api/placements.php` (~50 lines: read/write one JSON file per pack, check the shared password) and switch `src/main.js` from `localStore` to `src/store/apiStore.js`, which already targets that endpoint. Until then, **Save JSON / Load JSON** through the shared Drive folder is the hand-off.
