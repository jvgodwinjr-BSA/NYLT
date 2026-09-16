# Security

## Reporting a problem

**Do not open a public issue** for anything involving exposed personal information, the shared password, or a way around the roster encryption.

Use GitHub's private reporting: **Security → Advisories → Report a vulnerability** on this repository. If that is unavailable, contact the repository owner or the NYLT Course Director directly through normal council channels.

If the exposure involves a youth's personal information, treat it as urgent and tell the Course Director the same day, whether or not it also gets reported here.

## What this project protects, and how

The repository and the deployed site are both public. The roster is mostly minors. So:

- **Schedule data contains no names.** Placements reference role ids (`TG-1`, `QM-ADULT`, `SPL`). Every pack CSV and every saved schedule file is name-free by construction.
- **Names exist in exactly one artifact**: `public/roster.enc`. It is AES-256-GCM ciphertext; the key is derived from the shared password with PBKDF2-SHA256 at 210,000 iterations. It is committed and deployed as ciphertext.
- **Decryption happens in the browser** via WebCrypto after the password gate. The decrypted map lives in memory and `sessionStorage` only. It is never written to disk, never sent anywhere, and is gone when the tab closes.
- **Without the password the app still works**, showing role codes. Exports render whatever is on screen and are generated client-side.
- **`npm run check:names` enforces all of this** and runs in CI and (once installed) before every commit.

## The shared schedule

`api/placements.php` requires the shared password on **every** request, read or write, sent as the `X-Schedule-Password` header over HTTPS. The server stores only a PBKDF2-SHA256 hash (210,000 iterations) in `api/config.php`, never the password. A failed attempt sleeps 250 ms to blunt online guessing.

The schedule itself contains no personal data — placements reference role ids — so the file at risk holds a course plan, not a roster.

Two consequences worth stating plainly:

- **The browser now holds the password**, in `sessionStorage`, because the app needs it to save. It is tab-scoped and gone when the tab closes. Previously only the decrypted roster was cached; it is now one secret instead of two.
- **Anyone with the password can edit the shared schedule**, not just read it. That is the same trust boundary as the roster, so it adds no new one — but it does mean a leaked password costs you edits as well as names.

## What this does not protect against

Stated plainly so nobody is surprised:

- **Anyone who has the shared password.** One password, shared by the staff who need it. Treat it like a gate key, not a per-person credential.
- **A password that leaks later.** `roster.enc` is public and permanent — anyone can keep a copy today and decrypt it the day the password gets out. Rotation re-encrypts future copies; it cannot un-publish an old one.
- **Git history.** A name committed in plaintext stays in history even after the file is fixed. This is why the pre-commit guard exists.
- **Brute force on a weak password.** 210,000 PBKDF2 iterations makes guessing slow, not impossible. Use a passphrase, not a word. `npm run encrypt-roster -- --generate` produces one.

## Rotating the password

```
# edit roster.local.csv if needed (gitignored)
npm run encrypt-roster -- --generate     # or omit --generate to choose your own
git add public/roster.enc && git commit && git push
```

Share the new passphrase through a channel you trust — not in the repository, not in an issue, not in a commit message, and not in the same place the site link is posted. Everyone re-enters it once per device.

## Deployment posture

- **HTTPS is required.** Browsers only expose WebCrypto on secure origins, so without TLS the roster cannot be decrypted at all. Turn on Hostinger's free certificate.
- **Consider a second lock.** hPanel → Security → Password Protect Directories adds server-side HTTP Basic auth, so nothing is served to anyone without a password. Recommended on top of the in-app gate.
- `scripts/build.mjs` emits an `.htaccess` that disables directory indexes and marks data files `no-store`.

## Dependencies

There are none. No runtime packages, no build tooling, no lockfile — nothing to audit and no supply chain to compromise. Keep it that way; `npm run lint` fails if `dependencies` is non-empty.
