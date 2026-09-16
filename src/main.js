import { PACK_ID } from './config.js';
import { loadPack } from './pack.js';
import { state, subscribe, setEvent, setView, undo, redo, currentEvent, replaceSchedule, addPlacement, eventPlacements, select, activities } from './state.js';
import { localStore, serializeSchedule, downloadText, pickFile } from './store/localStore.js';
import { renderRail } from './catalog.js';
import { renderCanvas } from './canvas.js';
import { installDrag } from './drag.js';
import { renderBlockEditor, showQuickActivity } from './editor.js';
import { evaluate, byPlacement, coverageMatrix } from './conflicts.js';
import { fetchRosterBlob, decryptRoster, cacheRoster, loadCachedRoster, forgetRoster, cryptoAvailable } from './roster.js';
import { el, clear } from './util.js';
import { renderPrintView } from './export/printView.js';

const $ = (s) => document.querySelector(s);
state.panelTab = 'event';
state.violations = [];

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
      ? el('button.btn', { onClick: () => { forgetRoster(); state.roster = null; render('view'); }, title: 'Forget names on this device' }, '🔓 Names on · Lock')
      : el('button.btn', { onClick: () => showGate(state.rosterBlob).then(() => render('view')) }, '🔒 Unlock names')) : null,
    el('span', { id: 'save-state', class: 'save-state' + (state.fileDirty ? ' dirty' : '') }, state.fileDirty ? `● unsaved to file${state.lastFileSave ? ' since ' + state.lastFileSave : ''}` : (state.lastFileSave ? `saved ${state.lastFileSave}` : 'autosaves in this browser')),
  ].filter(Boolean));
}

// ---------- file save / load ----------
function saveJson() {
  const data = serializeSchedule(state);
  downloadText(JSON.stringify(data, null, 1), `${state.pack.id}-schedule-${data.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`);
  state.fileDirty = false; state.lastFileSave = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  render('view');
}
async function loadJson() {
  const f = await pickFile('.json'); if (!f) return;
  try {
    const data = JSON.parse(f.text);
    if (data.format !== 'program-scheduler/schedule') throw new Error('Not a schedule file');
    if (data.pack && data.pack !== state.pack.id && !confirm(`This file is for pack "${data.pack}", current pack is "${state.pack.id}". Load anyway?`)) return;
    replaceSchedule(data); state.fileDirty = false; state.lastFileSave = `loaded ${f.name}`; render('view');
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
      try { state.roster = await decryptRoster(blob, pw.value); cacheRoster(state.roster); overlay.remove(); resolve(true); }
      catch (ex) { err.textContent = ex.message; pw.select(); }
    } },
      el('h2', { style: { margin: 0 } }, 'Program Scheduler'),
      el('p.muted', { style: { margin: 0 } }, `Enter the shared password to see staff names (${blob.count} on the roster). Without it the schedule shows role codes only.`),
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
  if (what === 'data') localStore.save(state.pack.id, serializeSchedule(state));
  state.violations = evaluate({ placements: state.placements, activities: activities(), events: state.pack.events, constraints: state.pack.constraints });
  renderHeader();
  renderRail($('#rail'), { onQuickAdd: () => showQuickActivity(() => render('data')) });
  renderCanvas($('#canvas'), { violationsByPlacement: byPlacement(state.violations) });
  renderPanel();
  renderPrintView($('#print-view'));
}

async function init() {
  try { state.pack = await loadPack(PACK_ID); }
  catch (e) { $('#canvas').textContent = `Could not load content pack: ${e.message}`; return; }
  const saved = localStore.load(PACK_ID);
  if (saved) { state.placements = saved.placements ?? []; state.customActivities = saved.customActivities ?? []; }
  const q = new URLSearchParams(location.search);
  state.eventId = state.pack.events.find((e) => e.id === q.get('event'))?.id ?? state.pack.events[0].id;
  state.rosterBlob = await fetchRosterBlob();
  if (state.rosterBlob) { state.roster = loadCachedRoster(); if (!state.roster && !q.has('nogate')) await showGate(state.rosterBlob); }
  subscribe(render);
  installDrag({ rail: $('#rail'), canvas: $('#canvas') });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); });
  render('all');
}
init();
