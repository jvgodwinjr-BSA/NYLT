// Shared storage on the website, talking to api/placements.php.
//
// The schedule lives on the server so everyone sees the same plan, instead of each browser
// keeping its own copy. Writes carry the version they were based on; the server rejects a
// stale one with 409 rather than letting two people silently overwrite each other.
//
// localStore stays in play underneath as an offline cache, so a dropped connection or a
// missing API degrades to browser-only rather than losing work.

export class ApiUnavailable extends Error { constructor(m, status) { super(m); this.code = 'unavailable'; this.status = status; } }
export class ApiUnauthorized extends Error { constructor(m) { super(m); this.code = 'unauthorized'; } }
export class ApiConflict extends Error { constructor(m, current) { super(m); this.code = 'conflict'; this.current = current; } }

export function createApiStore({ endpoint = './api/placements.php', password }) {
  let version = 0;
  const headers = () => ({ 'X-Schedule-Password': password, 'Content-Type': 'application/json' });
  const url = (packId, extra = '') => `${endpoint}?pack=${encodeURIComponent(packId)}${extra}`;

  async function parse(r) {
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { throw new ApiUnavailable('The site returned something that is not JSON — PHP may not be running.', r.status); }
  }

  return {
    get version() { return version; },
    setVersion(v) { version = Number(v) || 0; },

    /** @returns the stored schedule. Throws ApiUnauthorized / ApiUnavailable. */
    async load(packId) {
      let r;
      try { r = await fetch(url(packId), { headers: headers(), cache: 'no-store' }); }
      catch (e) { throw new ApiUnavailable(`Could not reach the site (${e.message}).`, 0); }
      if (r.status === 401) throw new ApiUnauthorized('The site rejected the shared password.');
      if (r.status === 503) throw new ApiUnavailable('Shared saving is not set up on the site yet (api/config.php missing).', 503);
      if (!r.ok) throw new ApiUnavailable(`Shared saving unavailable (HTTP ${r.status}).`, r.status);
      const d = await parse(r);
      version = Number(d.version) || 0;
      return { placements: d.placements ?? [], customActivities: d.customActivities ?? [], version, savedAt: d.savedAt, savedBy: d.savedBy };
    },

    /** Version-checked write. Throws ApiConflict when someone else saved first. */
    async save(packId, data, { force = false, savedBy = '' } = {}) {
      let r;
      const body = JSON.stringify({ version, placements: data.placements ?? [], customActivities: data.customActivities ?? [], savedBy });
      try { r = await fetch(url(packId, force ? '&force=1' : ''), { method: 'PUT', headers: headers(), body }); }
      catch (e) { throw new ApiUnavailable(`Could not reach the site (${e.message}).`, 0); }
      if (r.status === 401) throw new ApiUnauthorized('The site rejected the shared password.');
      if (r.status === 409) {
        const d = await parse(r);
        version = Number(d.currentVersion) || version;
        throw new ApiConflict('Someone else saved a newer version.', d.current);
      }
      if (!r.ok) throw new ApiUnavailable(`Save failed (HTTP ${r.status}).`, r.status);
      const d = await parse(r);
      version = Number(d.version) || version + 1;
      return d;
    },

    /** Cheap check for a newer version, so one person's changes reach the other without a reload. */
    async peekVersion(packId) {
      try {
        const r = await fetch(url(packId), { headers: headers(), cache: 'no-store' });
        if (!r.ok) return null;
        const d = await parse(r);
        return { version: Number(d.version) || 0, data: d };
      } catch { return null; }
    },
  };
}
