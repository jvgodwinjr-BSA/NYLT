// Upgrade path for shared state on Hostinger web hosting (which runs PHP, not Node):
// a small api/placements.php that reads/writes one JSON file behind the shared password.
// Same interface as localStore. Not wired in v1.
export const apiStore = {
  endpoint: './api/placements.php',
  async load(packId) { const r = await fetch(`${this.endpoint}?pack=${encodeURIComponent(packId)}`); return r.ok ? r.json() : null; },
  async save(packId, data) { const r = await fetch(`${this.endpoint}?pack=${encodeURIComponent(packId)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); return r.ok; },
};
