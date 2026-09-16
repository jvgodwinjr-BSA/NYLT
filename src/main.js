import { PACK_ID } from './config.js';
import { loadPack } from './pack.js';
import { state, subscribe, setEvent, setView, undo, redo, currentEvent, replaceSchedule } from './state.js';
import { localStore, serializeSchedule, downloadText, pickFile } from './store/localStore.js';
import { renderRail } from './catalog.js';
import { renderCanvas } from './canvas.js';
import { el, clear } from './util.js';

const $ = (s) => document.querySelector(s);

function renderHeader() {
  const h = clear($('#controls'));
  const ev = currentEvent();
  h.append(...[

    el('select.sel', { onChange: (e) => setEvent(e.target.value) }, state.pack.events.map((e) => el('option', { value: e.id, selected: e.id === state.eventId }, e.name))),
    el('div.seg', {},
      el('button', { class: 'seg-btn' + (state.view === 'all' ? ' on' : ''), onClick: () => setView('all') }, 'All days'),
      el('button', { class: 'seg-btn' + (state.view === 'day' ? ' on' : ''), onClick: () => setView('day') }, 'One day')),
    state.view === 'day' && ev ? el('select.sel', { onChange: (e) => setView('day', Number(e.target.value)) }, ev.days.map((d, i) => el('option', { value: i, selected: i === state.dayIndex }, `${d.label} · Day ${d.n}`))) : null,
    el('span.spacer'),
    el('button.btn', { onClick: undo, title: 'Ctrl/Cmd-Z' }, 'Undo'),
    el('button.btn', { onClick: redo, title: 'Ctrl/Cmd-Shift-Z' }, 'Redo'),
    el('button.btn', { onClick: saveJson }, 'Save JSON'),
    el('button.btn', { onClick: loadJson }, 'Load JSON'),
    el('span', { id: 'save-state', class: 'save-state' + (state.fileDirty ? ' dirty' : '') }, state.fileDirty ? `● unsaved to file${state.lastFileSave ? ' since ' + state.lastFileSave : ''}` : (state.lastFileSave ? `saved ${state.lastFileSave}` : 'autosaves in this browser')),
  ].filter(Boolean));
}

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

function renderPanel() {
  const p = clear($('#panel'));
  const ev = currentEvent();
  p.append(el('h2', {}, ev?.name ?? ''), el('p.muted', {}, ev?.notes ?? ''),
    el('p.muted', {}, `${ev?.days.length ?? 0} days · ${ev?.tracks.length ?? 0} lanes · ${state.placements.filter((x) => x.event_id === ev?.id).length} placements`));
}

export function render(what = 'all') {
  if (what === 'data') localStore.save(state.pack.id, serializeSchedule(state));
  renderHeader();
  renderRail($('#rail'), { onQuickAdd: () => alert('Quick activity arrives in the next step.') });
  renderCanvas($('#canvas'));
  renderPanel();
}

async function init() {
  try {
    state.pack = await loadPack(PACK_ID);
  } catch (e) { $('#canvas').textContent = `Could not load content pack: ${e.message}`; return; }
  const saved = localStore.load(PACK_ID);
  if (saved) { state.placements = saved.placements ?? []; state.customActivities = saved.customActivities ?? []; }
  const want = new URLSearchParams(location.search).get('event');
  state.eventId = state.pack.events.find((e) => e.id === want)?.id ?? state.pack.events[0].id;
  subscribe(render);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
  render('all');
}
init();
