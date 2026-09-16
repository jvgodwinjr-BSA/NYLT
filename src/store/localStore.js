// v1 persistence: localStorage on every change + explicit JSON file save/load (hand the file around via Drive).
import { STORAGE_KEY } from '../config.js?v=4';

export const localStore = {
  load(packId) { try { const raw = localStorage.getItem(STORAGE_KEY(packId)); return raw ? JSON.parse(raw) : null; } catch { return null; } },
  save(packId, data) { try { localStorage.setItem(STORAGE_KEY(packId), JSON.stringify(data)); return true; } catch (e) { console.warn('localStorage unavailable', e); return false; } },
  clear(packId) { try { localStorage.removeItem(STORAGE_KEY(packId)); } catch {} },
};

export const serializeSchedule = (state) => ({
  format: 'program-scheduler/schedule', version: 1, pack: state.pack.id, savedAt: new Date().toISOString(),
  placements: state.placements, customActivities: state.customActivities,
});

export function downloadText(text, filename, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept = '.json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => { const f = input.files?.[0]; if (!f) return resolve(null); const r = new FileReader(); r.onload = () => resolve({ name: f.name, text: r.result }); r.readAsText(f); };
    input.click();
  });
}
