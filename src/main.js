import { PACK_ID } from './config.js';
import { loadPack } from './pack.js';
import { state, subscribe, setEvent, setView, undo, redo, currentEvent, replaceSchedule, addPlacement, eventPlacements, select, activities } from './state.js';
import { localStore, serializeSchedule, downloadText, pickFile } from './store/localStore.js';
import { renderRail } from './catalog.js';
import { renderCanvas } from './canvas.js';
import { installDrag } from './drag.js';
import { renderBlockEditor, showQuickActivity } from './editor.js';
import { evaluate, byPlacement, coverageMatrix } from './conflicts.js';
import { fetchRosterBlob, decryptRoster, cachePassword, cachedPassword, forgetRoster, cryptoAvailable } from './roster.js';
import { createApiStore, ApiConflict, ApiUnauthorized } from './store/apiStore.js';
import { el, clear } from './util.js';
import { renderPrintView } from './export/printView.js';

const $ = (s) => document.querySelector(s);
state.panelTab = 'event';
state.violations = [];
state.remote = null;          // ApiStore when the site is saving for us
state.sync = 'local';         // local | pending | saving | saved | error | conflict
state.syncNote = '';
let saveTimer = null, pollTimer = null, retryAt = 0;

// Saving on the site is the point of shared mode, so it is debounced rather than manual:
// a drag fires many mutations, and one write 1.2s after the last of them is plenty.
function scheduleRemoteSave() {
  if (!state.remote) return;
  clearTimeout(saveTimer);
  if (state.sync !== 'conflict') setSync('pending');
  saveTimer = setTimeout(() => void remoteSave(), 1200);
}
function setSync(s, note = '') { state.sync = s; state.syncNote = note; renderHeader(); }

async function remoteSave(force = false) {
  if (!state.remote) return;
  clearTimeout(saveTimer);
  setSync('saving');
  try {
    const r = await state.remote.save(state.pack.id, { placements: state.placements, customActivities: state.customActivities }, { force });
    state.fileDirty = false;
    setSync('saved', new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    return r;
  } catch (e) {
    if (e instanceof ApiConflict) { setSync('conflict'); showConflict(e.current); return; }
    if (e instanceof ApiUnauthorized) { state.remote = null; setSync('local', 'the site rejected the password'); return; }
    retryAt = Date.now() + 15000;
    setSync('error', e.message);
    setTimeout(() => { if (state.sync === 'error') void remoteSave(); }, 15000);
  }
}

// Someone else's changes should show up without anyone reloading. Only adopt them when this
// browser has nothing unsaved, so an in-progress edit is never yanked away.
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!state.remote || state.sync === 'pending' || state.sync === 'saving' || state.sync === 'conflict') return;
    if (document.hidden) return;
    const peek = await state.remote.peekVersion(state.pack.id);
    if (!peek || peek.version <= state.remote.version) return;
    state.remote.setVersion(peek.version);
    replaceSchedule({ placements: peek.data.placements ?? [], customActivities: peek.data.customActivities ?? [] });
    state.fileDirty = false;
    setSync('saved', `updated from the site${peek.data.savedBy ? ' (' + peek.data.savedBy + ')' : ''}`);
  }, 20000);
}

function showConflict(current) {
  const bar = el('div.conflict-bar', {},
    el('strong', {}, 'Someone else saved a newer version of this schedule.'),
    ' Your changes are still on screen but are not saved on the site.',
    el('button.btn', { onClick: () => { document.querySelector('.conflict-bar')?.remove(); state.remote.setVersion(current?.version ?? state.remote.version); replaceSchedule({ placements: current?.placements ?? [], customActivities: current?.customActivities ?? [] }); state.fileDirty = false; setSync('saved', 'loaded the site copy'); } }, 'Use theirs (discard mine)'),
    el('button.btn.primary', { onClick: () => { document.querySelector('.conflict-bar')?.remove(); void remoteSave(true); } }, 'Keep mine (overwrite)'),
    el('button.btn', { onClick: () => { saveJson(); } }, 'Save mine to a file first'));
  document.querySelector('.conflict-bar')?.remove();
  document.body.prepend(bar);
}

// ---------- header ----------
function renderHeader() {
  const h = clear($('#controls'));
  const ev = currentEvent();
  const mine = state.violations.filter((v) => !v.quiet && (v.event_id === state.eventId || v.placement_ids.some((id) => eventPlacements().some((p) => p.id === id))));
  const hard = mine.filter((v) => v.severity === 'hard').length, soft = mine.length - hard;
  h.append(...[
    el('select.sel', { onChange: (e) => setEvent(e.target.value) }, state.pack.events.map((e) => el('option', { value: e.id, selected: e.id === state.eventId }, e.name))),
    el('div.seg', {},
      el('button', { class: 'seg-btn' + (state.view === 'all' ? ' on' : ''), onClick: () => setView('all') }, 'All days'),
      el('button', { class: 'seg-btn' + (state.view === 'day' ? ' on' : ''), onClick: () => setView('day') }, 'One day')),
    state.view === 'day' && ev ? el('select.sel', { onChange: (e) => setView('day', Number(e.target.value)) }, ev.days.map((d, i) => el('option', { value: i, selected: i === state.dayIndex }, `${d.label} · Day ${d.n}`))) : null,
    el('button', { class: 'btn' + (hard ? ' has-hard' : soft ? ' has-soft' : ''), onClick: () => { select(null); state.panelTab = 'issues'; render('view'); }, title: 'Open the Issues panel' },
      hard || soft ? `${hard ? hard + ' red' : ''}${hard && soft ? ' · ' : ''}${soft ? soft + ' amber' : ''}` : 'No issues'),
    el('span.spacer'),
    el('button.btn', { onClick: undo, title: 'Ctrl/Cmd-Z' }, 'Undo'),
    el('button.btn', { onClick: redo, title: 'Ctrl/Cmd-Shift-Z' }, 'Redo'),
    el('button.btn', { onClick: saveJson }, 'Save JSON'),
    el('button.btn', { onClick: loadJson }, 'Load JSON'),
    el('div.menu', {}, el('button.btn', { onClick: (e) => e.currentTarget.parentElement.classList.toggle('open') }, 'Export ▾'),
      el('div.menu-items', {},
        el('button.btn', { onClick: () => exportRunOfShow() }, 'Run-of-show CSV (this event)'),
        el('button.btn', { onClick: () => exportSheetSync() }, 'Authority sheet sync CSV'),
        el('button.btn', { onClick: () => window.print() }, 'Print / Save as PDF'))),
    state.rosterBlob ? (state.roster
      ? el('button.btn', { onClick: () => { forgetRoster(); state.roster = null; state.password = null; state.remote = null; clearInterval(pollTimer); setSync('local', 'locked'); render('view'); }, title: 'Forget the password on this device and stop saving to the site' }, '🔓 Names on · Lock')
      : el('button.btn', { onClick: () => showGate(state.rosterBlob).then(async (ok) => { if (ok) await connectToSite(); render('view'); }) }, '🔒 Unlock names')) : null,
    syncIndicator(),
  ].filter(Boolean));
}

function syncIndicator() {
  if (!state.remote) {
    const why = state.syncNote ? ` (${state.syncNote})` : '';
    return el('span', { id: 'save-state', class: 'save-state' + (state.fileDirty ? ' dirty' : ''), title: 'Changes are kept in this browser only. Use Save JSON to share them.' },
      `browser only${why}`);
  }
  const map = {
    pending: ['sync', '● saving soon'],
    saving: ['sync', 'saving to site…'],
    saved: ['sync ok', `✓ saved to site${state.syncNote ? ' · ' + state.syncNote : ''}`],
    error: ['sync bad', `⚠ not saved — retrying`],
    conflict: ['sync bad', '⚠ conflict — see banner'],
  };
  const [cls, text] = map[state.sync] ?? ['sync', ''];
  return el('span', { id: 'save-state', class: `save-state ${cls}`, title: state.syncNote || 'Everyone with the password sees this schedule.' }, text);
}

// ---------- file save / load ----------
function saveJson() {
  const data = serializeSchedule(state);
  downloadText(JSON.stringify(data, null, 1), `${state.pack.id}-schedule-${data.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`);
  state.lastFileSave = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!state.remote) state.fileDirty = false;
  render('view');
}
async function loadJson() {
  const f = await pickFile('.json'); if (!f) return;
  try {
    const data = JSON.parse(f.text);
    if (data.format !== 'program-scheduler/schedule') throw new Error('Not a schedule file');
    if (data.pack && data.pack !== state.pack.id && !confirm(`This file is for pack "${data.pack}", current pack is "${state.pack.id}". Load anyway?`)) return;
    replaceSchedule(data); state.fileDirty = false; state.lastFileSave = `loaded ${f.name}`;
    if (state.remote) await remoteSave(true); // the file the person just chose wins
    render('view');
  } catch (e) { alert(`Could not load: ${e.message}`); }
}
async function exportRunOfShow() { const m = await import('./export/runOfShow.js'); m.exportRunOfShowCsv(); }
async function exportSheetSync() { const m = await import('./export/sheetSync.js'); m.exportSheetSyncCsv(); }

// ---------- roster gate ----------
function showGate(blob) {
  return new Promise((resolve) => {
    const err = el('div.err');
    const pw = el('input', { type: 'password', placeholder: 'Shared password', autocomplete: 'current-password' });
    const overlay = el('div.gate', {}, el('form', { onSubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { state.roster = await decryptRoster(blob, pw.value); state.password = pw.value; cachePassword(pw.value); overlay.remove(); resolve(true); }
      catch (ex) { err.textContent = ex.message; pw.select(); }
    } },
      el('h2', { style: { margin: 0 } }, 'Program Scheduler'),
      el('p.muted', { style: { margin: 0 } }, `Enter the shared password to see staff names (${blob.count} on the roster) and to load and save the shared schedule. Without it you get role codes and a browser-only copy that nobody else sees.`),
      cryptoAvailable() ? null : el('div.err', {}, 'Names need HTTPS or localhost to decrypt.'),
      pw, err,
      el('button.btn.primary', { type: 'submit' }, 'Unlock names'),
      el('button.btn', { type: 'button', onClick: () => { overlay.remove(); resolve(false); } }, 'Continue without names')));
    document.body.append(overlay); setTimeout(() => pw.focus(), 0);
  });
}

// ---------- templates ----------
function applyTemplate(key, dayDate) {
  const t = state.pack.templates[key]; const ev = currentEvent(); if (!t || !ev) return 0;
  const day = ev.days.find((d) => d.date === dayDate); if (!day) return 0;
  const allHands = ev.tracks.find((x) => x.is_all_hands) ?? ev.tracks[0];
  const patrol = ev.tracks.find((x) => /patrol|tg/i.test(x.name) && !x.is_all_hands);
  let n = 0;
  for (const item of t.items) {
    const a = state.pack.activities.find((x) => x.id === item.activity_id); if (!a) continue;
    if (item.start_min < day.startMin || item.start_min >= day.endMin) continue;
    const track = a.delivery === 'TG' && patrol ? patrol : allHands;
    addPlacement({ activity_id: a.id, event_id: ev.id, track_id: track.id, day: day.date, start_min: item.start_min, duration_min: Math.min(item.duration_min, day.endMin - item.start_min) });
    n++;
  }
  return n;
}

// ---------- right panel ----------
const sdEvents = () => state.pack.constraints.find((c) => c.rule_type === 'practice_coverage')?.params?.sd_events ?? state.pack.events.filter((e) => /^SD/i.test(e.id)).map((e) => e.id);

function renderPanel() {
  const p = clear($('#panel'));
  const ev = currentEvent();
  const sel = state.placements.find((x) => x.id === state.selectedId);
  const vmap = byPlacement(state.violations);
  if (sel) { renderBlockEditor(p, sel, vmap.get(sel.id) ?? []); return; }
  const tab = (id, label) => el('button', { class: 'tab' + (state.panelTab === id ? ' on' : ''), onClick: () => { state.panelTab = id; render('view'); } }, label);
  p.append(el('div.tabs', {}, tab('event', 'Event'), tab('issues', 'Issues'), tab('coverage', 'Practice coverage')));

  if (state.panelTab === 'event') {
    p.append(el('h2', {}, ev?.name ?? ''), el('p.muted', {}, ev?.notes ?? ''),
      el('p.muted', {}, `${ev?.days.length ?? 0} days · ${ev?.tracks.length ?? 0} lanes · ${eventPlacements().length} placements`),
      el('p.muted', {}, 'Drag an activity from the left onto a lane. Click a block to edit it. Blocks in an all-hands lane span every lane.'));
    const keys = Object.keys(state.pack.templates ?? {});
    if (keys.length && ev) {
      const tSel = el('select', {}, keys.map((k) => el('option', { value: k }, state.pack.templates[k].label ?? k)));
      const dSel = el('select', {}, ev.days.map((d) => el('option', { value: d.date }, `${d.label} · Day ${d.n}`)));
      p.append(el('h3', {}, 'Start from last year'),
        el('p.muted', { style: { fontSize: '11px' } }, "Copies one of last year's day layouts onto a day of this event. Items outside the day's bounds are skipped. Undo reverts it."),
        el('label', {}, 'Layout', tSel), el('label', {}, 'Onto', dSel),
        el('button.btn', { style: { marginTop: '8px' }, onClick: () => { applyTemplate(tSel.value, dSel.value); render('data'); } }, 'Apply layout'));
    }
  }

  if (state.panelTab === 'issues') {
    const ids = new Set(eventPlacements().map((x) => x.id));
    const mine = state.violations.filter((v) => v.event_id === state.eventId || v.placement_ids.some((id) => ids.has(id)));
    const loud = mine.filter((v) => !v.quiet).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'hard' ? -1 : 1));
    const quiet = mine.filter((v) => v.quiet);
    p.append(el('h2', {}, `${loud.length} issue${loud.length === 1 ? '' : 's'} in ${ev?.name ?? ''}`));
    if (!loud.length) p.append(el('p.muted', {}, 'Nothing red or amber on this event.'));
    for (const v of loud) p.append(el('div', { class: `viol ${v.severity}`, onClick: () => { if (v.placement_ids[0]) { select(v.placement_ids[0]); document.querySelector(`.block[data-id="${v.placement_ids[0]}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } } },
      el('strong', {}, v.rule.replace(/_/g, ' ')), ' — ', v.message));
    if (quiet.length) {
      p.append(el('h3', {}, `${quiet.length} notice${quiet.length === 1 ? '' : 's'}`), el('p.muted', { style: { fontSize: '11px' } }, 'Not painted on the canvas: readiness and locked items not yet placed.'));
      for (const v of quiet) p.append(el('div.viol', { style: { background: '#f7f7f9', borderLeftColor: '#c3c9d1' }, onClick: () => { if (v.placement_ids[0]) select(v.placement_ids[0]); } }, v.message));
    }
    const other = state.violations.filter((v) => !v.quiet && !mine.includes(v)).length;
    if (other) p.append(el('p.muted', {}, `${other} more on other events.`));
  }

  if (state.panelTab === 'coverage') {
    const sds = sdEvents();
    const rows = coverageMatrix({ placements: state.placements, activities: activities(), sdEvents: sds });
    const covered = rows.filter((r) => r.covered), inferred = rows.filter((r) => r.inferred), unassigned = rows.filter((r) => !r.assigned && !r.inferred);
    p.append(el('h2', {}, 'Practice coverage'),
      el('p.muted', {}, `${covered.length} of ${rows.length} presentations have a practice slot${inferred.length ? ` (${inferred.length} inferred from where they are placed — the sheet sync export fills Practice SD in)` : ''}. ${unassigned.length ? unassigned.length + ' have no Practice SD in the Authority sheet and are not placed in any SD yet.' : ''}`),
      el('p.muted', { style: { fontSize: '11px' } }, 'Practice SD comes from the Authority sheet (re-import to update). Click an SD cell to open that weekend.'));
    const table = el('table.cov', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Presentation'), sds.map((s) => el('th', {}, s)), el('th', {}, 'Ready'))));
    const body = el('tbody');
    for (const r of rows) body.append(el('tr', { class: r.assigned ? '' : 'unassigned' },
      el('td.name', { title: r.activity.name }, r.activity.name.replace('Historic American Flag Presentation: ', 'Flag: ').replace('Communicating—', 'Com ')),
      sds.map((s) => el('td', { class: r.cells[s], style: { cursor: 'pointer' }, onClick: () => setEvent(s), title: r.cells[s] === 'missing' ? `Assigned to ${s}, not placed yet` : r.cells[s] === 'ok' ? `Placed in ${s}` : '' },
        r.cells[s] === 'ok' ? '✓' : r.cells[s] === 'missing' ? '✗' : r.assigned || r.inferred ? '' : '?')),
      el('td', { style: { fontSize: '10px' } }, r.activity.ready || '—')));
    table.append(body); p.append(table);
  }
}

// ---------- render ----------
export function render(what = 'all') {
  if (what === 'data') { localStore.save(state.pack.id, serializeSchedule(state)); scheduleRemoteSave(); }
  state.violations = evaluate({ placements: state.placements, activities: activities(), events: state.pack.events, constraints: state.pack.constraints });
  renderHeader();
  renderRail($('#rail'), { onQuickAdd: () => showQuickActivity(() => render('data')) });
  renderCanvas($('#canvas'), { violationsByPlacement: byPlacement(state.violations) });
  renderPanel();
  renderPrintView($('#print-view'));
}

// Prefer the copy on the website. Falls back to this browser when the API is absent (local
// dev, PHP off) or unreachable, so the app still works rather than showing nothing.
async function connectToSite() {
  if (!state.password || new URLSearchParams(location.search).has('local')) { setSync('local', state.password ? '' : 'no password'); return; }
  const api = createApiStore({ password: state.password });
  try {
    const remote = await api.load(state.pack.id);
    state.remote = api;
    const localCount = state.placements.length;
    if (remote.version === 0 && localCount) {
      // First run against a fresh server: push what this browser already has rather than
      // silently replacing the person's work with an empty schedule.
      await api.save(state.pack.id, { placements: state.placements, customActivities: state.customActivities }, { force: true });
      setSync('saved', 'moved this browser\'s plan to the site');
    } else {
      replaceSchedule({ placements: remote.placements, customActivities: remote.customActivities });
      state.fileDirty = false;
      setSync('saved', remote.savedAt ? `site copy v${remote.version}` : 'site copy is empty');
    }
    startPolling();
  } catch (e) {
    state.remote = null;
    setSync('local', e.code === 'unavailable' && e.status === 503 ? 'shared saving not set up yet' : e.message);
  }
}

async function init() {
  try { state.pack = await loadPack(PACK_ID); }
  catch (e) { $('#canvas').textContent = `Could not load content pack: ${e.message}`; return; }
  const saved = localStore.load(PACK_ID);
  if (saved) { state.placements = saved.placements ?? []; state.customActivities = saved.customActivities ?? []; }
  const q = new URLSearchParams(location.search);
  state.eventId = state.pack.events.find((e) => e.id === q.get('event'))?.id ?? state.pack.events[0].id;
  state.rosterBlob = await fetchRosterBlob();
  const cached = cachedPassword();
  if (state.rosterBlob && cached) {
    try { state.roster = await decryptRoster(state.rosterBlob, cached); state.password = cached; } catch { forgetRoster(); }
  }
  if (state.rosterBlob && !state.roster && !q.has('nogate')) await showGate(state.rosterBlob);
  await connectToSite();
  subscribe(render);
  installDrag({ rail: $('#rail'), canvas: $('#canvas') });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); });
  render('all');
}
init();
