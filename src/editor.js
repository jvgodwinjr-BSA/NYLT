// Right-panel block editor and the Quick Activity form.
import { TYPE_ORDER } from './config.js?v=5';
import { state, activityById, currentEvent, updatePlacement, removePlacement, addCustomActivity, resourceLabel, select } from './state.js?v=5';
import { el, fmtRange, minToHHMM, hhmmToMin, snap } from './util.js?v=5';

export function renderBlockEditor(root, p, violations = []) {
  const a = activityById(p.activity_id);
  const ev = currentEvent();
  const day = ev.days.find((d) => d.date === p.day);
  const res = state.pack.resources;
  const teams = [...new Set(res.map((r) => r.team))];
  root.append(
    el('h2', {}, a?.name ?? p.activity_id),
    el('p.muted', {}, `${a?.type ?? ''}${a?.delivery ? ' · ' + a.delivery + ' delivery' : ''}${a?.group ? ' · group ' + a.group : ''}${a?.syllabus_day ? ' · syllabus day ' + a.syllabus_day : ''}`),
    violations.length ? el('div', {}, violations.map((v) => el('div', { class: `viol ${v.severity}` }, v.message))) : null,
    el('label', {}, 'Day', el('select', { onChange: (e) => updatePlacement(p.id, { day: e.target.value }) }, ev.days.map((d) => el('option', { value: d.date, selected: d.date === p.day }, `${d.label} · Day ${d.n}`)))),
    el('label', {}, 'Lane', el('select', { onChange: (e) => updatePlacement(p.id, { track_id: e.target.value }) }, ev.tracks.map((t) => el('option', { value: t.id, selected: t.id === p.track_id }, t.name)))),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      el('label', {}, 'Start', el('input', { type: 'time', step: 900, value: minToHHMM(p.start_min), onChange: (e) => { if (e.target.value) updatePlacement(p.id, { start_min: snap(hhmmToMin(e.target.value)) }); } })),
      el('label', {}, 'Minutes', el('input', { type: 'number', min: 15, step: 15, value: p.duration_min, onChange: (e) => updatePlacement(p.id, { duration_min: Math.max(15, snap(Number(e.target.value) || 15)) }) }))),
    el('p.muted', {}, fmtRange(p.start_min, p.start_min + p.duration_min), a && p.duration_min !== a.duration_min ? ` (catalog says ${a.duration_min})` : ''),
    el('h3', {}, 'People'),
    el('div.people', {}, teams.map((team) => el('div', {}, el('div.muted', { style: { fontSize: '11px', marginTop: '6px' } }, team),
      res.filter((r) => r.team === team).map((r) => el('label.person', { style: { display: 'inline-flex', gap: '4px', marginRight: '10px', fontSize: '12px', color: 'inherit' } },
        el('input', { type: 'checkbox', style: { width: 'auto' }, checked: p.resource_ids?.includes(r.id), onChange: (e) => {
          const ids = new Set(p.resource_ids ?? []); e.target.checked ? ids.add(r.id) : ids.delete(r.id); updatePlacement(p.id, { resource_ids: [...ids] }); } }),
        el('span', { title: r.role }, resourceLabel(r.id))))))),
    el('label', {}, el('input', { type: 'checkbox', style: { width: 'auto' }, checked: p.flags?.includes('override'), onChange: (e) => {
      const f = new Set(p.flags ?? []); e.target.checked ? f.add('override') : f.delete('override'); updatePlacement(p.id, { flags: [...f] }); } }),
      ' Override: intentionally in this lane (silences the TG-delivery warning)'),
    el('label', {}, 'Notes', el('textarea', { rows: 2, onChange: (e) => updatePlacement(p.id, { notes: e.target.value }) }, p.notes ?? '')),
    el('div', { style: { display: 'flex', gap: '6px', marginTop: '10px' } },
      el('button.btn', { onClick: () => removePlacement(p.id) }, 'Remove from schedule'),
      el('button.btn', { onClick: () => select(null) }, 'Close')),
    el('p.muted', { style: { fontSize: '11px' } }, 'Arrow keys nudge 15 min (Shift = 1 hour), ← → change lane, Delete removes, Esc closes.'),
  );
}

export function showQuickActivity(onDone) {
  const name = el('input', { placeholder: 'e.g. Set up QM shed', required: true });
  const mins = el('input', { type: 'number', min: 15, step: 15, value: 60 });
  const type = el('select', {}, TYPE_ORDER.map((t) => el('option', { value: t, selected: t === 'staff_task' }, t)));
  const aud = el('select', {}, ['staff', 'troop', 'patrol'].map((t) => el('option', { value: t }, t)));
  const overlay = el('div.gate', {}, el('form', { onSubmit: (e) => {
    e.preventDefault();
    const n = name.value.trim(); if (!n) return;
    const id = 'custom-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-3);
    addCustomActivity({ id, name: n, duration_min: Math.max(15, snap(Number(mins.value) || 15)), type: type.value, audience: aud.value,
      delivery: aud.value === 'patrol' ? 'TG' : aud.value === 'staff' ? 'Staff' : 'Troop', group: '', syllabus_day: null, soft_vs_hard: 'soft',
      practice_sd: '', owner_id: '', ready: '', location: '', tags: ['custom'], notes: '', source: 'custom' });
    overlay.remove(); onDone?.();
  } },
    el('h2', { style: { margin: 0 } }, 'Quick activity'),
    el('p.muted', { style: { margin: 0 } }, 'For things that are not in the catalog, like SD-weekend staff tasks. Saved with the schedule; never written back to the Authority sheet.'),
    el('label', {}, 'Name', name), el('label', {}, 'Minutes', mins), el('label', {}, 'Type', type), el('label', {}, 'Who', aud),
    el('button.btn.primary', { type: 'submit' }, 'Add to catalog'),
    el('button.btn', { type: 'button', onClick: () => overlay.remove() }, 'Cancel')));
  document.body.append(overlay); setTimeout(() => name.focus(), 0);
}
