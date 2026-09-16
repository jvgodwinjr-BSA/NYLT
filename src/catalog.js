// Left rail: the catalog. Never consumes an item; shows how many times each is placed in the current event.
import { TYPE_ORDER } from './config.js?v=3';
import { state, activities, eventPlacements, setFilters } from './state.js?v=3';
import { el, clear } from './util.js?v=3';

const TYPE_LABEL = { presentation: 'Presentations', meal: 'Meals', ceremony: 'Ceremonies', meeting: 'Meetings', outpost: 'Outpost', game: 'Games & activities', logistics: 'Logistics', staff_task: 'Staff tasks', other: 'Other' };

export function renderRail(root, { onQuickAdd } = {}) {
  clear(root);
  const f = state.filters;
  const counts = new Map();
  for (const p of eventPlacements()) counts.set(p.activity_id, (counts.get(p.activity_id) ?? 0) + 1);

  const search = el('input.rail-search', { type: 'search', placeholder: 'Search activities…', value: f.q, onInput: (e) => setFilters({ q: e.target.value }) });
  const types = TYPE_ORDER.filter((t) => activities().some((a) => a.type === t));
  const chips = el('div.chips', {},
    el('button.chip', { class: 'chip' + (f.type ? '' : ' on'), onClick: () => setFilters({ type: '' }) }, 'All'),
    types.map((t) => el('button', { class: 'chip' + (f.type === t ? ' on' : ''), onClick: () => setFilters({ type: f.type === t ? '' : t }) }, TYPE_LABEL[t] ?? t)));
  const unplaced = el('label.rail-toggle', {}, el('input', { type: 'checkbox', checked: f.unplacedOnly, onChange: (e) => setFilters({ unplacedOnly: e.target.checked }) }), ' Only not yet placed in this event');
  root.append(el('div.rail-head', {}, search, chips, unplaced));

  const q = f.q.trim().toLowerCase();
  const list = el('div.rail-list');
  for (const t of types) {
    if (f.type && f.type !== t) continue;
    const items = activities().filter((a) => a.type === t)
      .filter((a) => !q || `${a.name} ${a.tags.join(' ')} ${a.notes ?? ''}`.toLowerCase().includes(q))
      .filter((a) => !f.unplacedOnly || !counts.get(a.id));
    if (!items.length) continue;
    list.append(el('h3.rail-group', {}, TYPE_LABEL[t] ?? t, el('span.count', {}, items.length)));
    for (const a of items) {
      const n = counts.get(a.id) ?? 0;
      list.append(el('div.rail-item', { class: `rail-item type-${a.type}`, dataset: { activityId: a.id }, title: a.notes || a.name },
        el('div.ri-name', {}, a.name),
        el('div.ri-meta', {}, `${a.duration_min} min`, a.delivery === 'TG' ? el('span.tag.tg', {}, 'TG / patrol') : null,
          a.group === 'C' ? el('span.tag', {}, 'flag') : null, a.soft_vs_hard === 'hard' ? null : el('span.tag.soft', {}, 'soft'),
          a.practice_sd ? el('span.tag', {}, `practice ${a.practice_sd}`) : null,
          n ? el('span.badge', {}, `placed ${n}×`) : null)));
    }
  }
  root.append(list);
  root.append(el('div.rail-foot', {}, el('button.btn', { onClick: onQuickAdd }, '+ Quick activity')));
}
