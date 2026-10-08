// Print view: one table per day. Hidden on screen; the only thing shown when printing.
//
// Prints either the event on screen (the default, and what Ctrl-P gives you) or every weekend at
// once, which is what you want on paper before staffing is settled — a reference you can mark up
// in a room rather than six separate trips through the event dropdown.
import { currentEvent, state, eventPlacements } from '../state.js?v=10';
import { runOfShowRows } from './runOfShow.js?v=10';
import { el, clear } from '../util.js?v=10';

/** Events worth printing: the ones with something on the clock. An empty weekend is a wasted page. */
export const printableEvents = () => (state.pack?.events ?? []).filter((e) => eventPlacements(e.id).length);

function eventSection(ev) {
  const rows = runOfShowRows(ev);
  const head = el('p.muted', {}, `${ev.location ?? ''} · ${ev.hard_start.replace('T', ' ')} to ${ev.hard_stop.replace('T', ' ')}`);
  const section = el('section.print-event', {}, el('h1', {}, `${ev.name} — Run of show`), head);
  for (const day of ev.days) {
    const dr = rows.filter((r) => r.Date === day.date);
    section.append(el('h2', {}, `${day.label} · Day ${day.n}`));
    if (!dr.length) { section.append(el('p.muted', {}, 'Nothing scheduled.')); continue; }
    section.append(el('table.ros', {}, el('thead', {}, el('tr', {}, ['Start', 'End', 'Activity', 'Lane', 'People', 'Notes'].map((h) => el('th', {}, h)))),
      el('tbody', {}, dr.map((r) => el('tr', { class: r['All hands'] ? 'all' : '' }, el('td', {}, r.Start), el('td', {}, r.End), el('td', {}, r.Activity, r.Issues ? el('span.flag', {}, ' ⚠') : null), el('td', {}, r.Lane), el('td', {}, r.People), el('td', {}, r.Notes))))));
  }
  return section;
}

/**
 * @param {Element} root  #print-view
 * @param {object}  [o]
 * @param {Array}   [o.events]  which events to render. Defaults to the one on screen.
 */
export function renderPrintView(root, { events } = {}) {
  clear(root);
  const list = (events ?? [currentEvent()]).filter(Boolean);
  if (!list.length) return;
  const stamp = `printed ${new Date().toLocaleString()}${state.roster ? '' : ' · names locked (role codes shown)'}`;
  if (list.length > 1) {
    // One cover line rather than repeating the stamp on every weekend, and it names what is here —
    // an empty weekend is left out, so the reader should be told which ones made it.
    const skipped = (state.pack?.events ?? []).filter((e) => !list.includes(e)).map((e) => e.id);
    // Filtered: append() turns a null argument into the literal string "null" on the page.
    root.append(...[
      el('h1.print-cover', {}, 'All weekends — Run of show'),
      el('p.muted', {}, `${list.map((e) => e.id).join(' · ')} · ${stamp}`),
      skipped.length ? el('p.muted', {}, `Not included (nothing scheduled yet): ${skipped.join(', ')}.`) : null,
    ].filter(Boolean));
  }
  for (const ev of list) root.append(eventSection(ev));
  if (list.length === 1) root.querySelector('.print-event .muted')?.append(` · ${stamp}`);
}
