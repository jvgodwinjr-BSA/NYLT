// Print view: one table per day of the current event. Hidden on screen; the only thing shown when printing.
import { currentEvent, state } from '../state.js?v=5';
import { runOfShowRows } from './runOfShow.js?v=5';
import { el, clear } from '../util.js?v=5';

export function renderPrintView(root) {
  clear(root);
  const ev = currentEvent(); if (!ev) return;
  const rows = runOfShowRows(ev);
  root.append(el('h1', {}, `${ev.name} — Run of show`), el('p.muted', {}, `${ev.location ?? ''} · ${ev.hard_start.replace('T', ' ')} to ${ev.hard_stop.replace('T', ' ')} · printed ${new Date().toLocaleString()}${state.roster ? '' : ' · names locked (role codes shown)'}`));
  for (const day of ev.days) {
    const dr = rows.filter((r) => r.Date === day.date);
    root.append(el('h2', {}, `${day.label} · Day ${day.n}`));
    if (!dr.length) { root.append(el('p.muted', {}, 'Nothing scheduled.')); continue; }
    root.append(el('table.ros', {}, el('thead', {}, el('tr', {}, ['Start', 'End', 'Activity', 'Lane', 'People', 'Notes'].map((h) => el('th', {}, h)))),
      el('tbody', {}, dr.map((r) => el('tr', { class: r['All hands'] ? 'all' : '' }, el('td', {}, r.Start), el('td', {}, r.End), el('td', {}, r.Activity, r.Issues ? el('span.flag', {}, ' ⚠') : null), el('td', {}, r.Lane), el('td', {}, r.People), el('td', {}, r.Notes))))));
  }
}
