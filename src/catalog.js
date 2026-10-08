// Left rail: the catalog. Never consumes an item; shows how many times each is placed in the current event.
import { TYPE_ORDER } from './config.js?v=10';
import { state, activities, eventPlacements, setFilters, setTaskStatus } from './state.js?v=10';
import { el, clear } from './util.js?v=10';
import { isTask, taskStatus, taskTally, taskKey, TASK_STATUS_LABEL } from './progress.js?v=10';

const TYPE_LABEL = { presentation: 'Presentations', meal: 'Meals', ceremony: 'Ceremonies', meeting: 'Meetings', outpost: 'Outpost', game: 'Games & activities', logistics: 'Logistics', staff_task: 'Staff tasks', other: 'Other' };

const taskEntryBy = (a, placement) => state.tasks?.[taskKey(a, placement)]?.by ?? '';

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
  // Most staff tasks are never placed on the clock, so "hide finished" is the filter that actually
  // shrinks the list as the team works through it.
  const hideDone = el('label.rail-toggle', {}, el('input', { type: 'checkbox', checked: f.hideDone, onChange: (e) => setFilters({ hideDone: e.target.checked }) }), ' Hide finished tasks');
  root.append(el('div.rail-head', {}, search, chips, unplaced, hideDone));

  const q = f.q.trim().toLowerCase();
  const list = el('div.rail-list');
  for (const t of types) {
    if (f.type && f.type !== t) continue;
    const items = activities().filter((a) => a.type === t)
      .filter((a) => !q || `${a.name} ${(a.tags ?? []).join(' ')} ${a.notes ?? ''}`.toLowerCase().includes(q))
      .filter((a) => !f.unplacedOnly || !counts.get(a.id))
      // "Finished" for a repeated task means every occurrence, not the first one.
      .filter((a) => { if (!f.hideDone || !isTask(a)) return true; const t = taskTally(state.tasks, a, state.placements); return t.done < t.total; });
    if (!items.length) continue;
    list.append(el('h3.rail-group', {}, TYPE_LABEL[t] ?? t, el('span.count', {}, items.length)));
    for (const a of items) {
      const n = counts.get(a.id) ?? 0;
      // A task scheduled once (or not at all) toggles from here. One scheduled several times has a
      // status per block, so the rail shows the tally and sends you to the canvas rather than
      // pretending one tap could finish all of them.
      const tally = isTask(a) ? taskTally(state.tasks, a, state.placements) : null;
      const single = tally && tally.total === 1;
      const only = single ? (tally.placements[0] ?? null) : null;
      const st = single ? taskStatus(state.tasks, a, only) : null;
      const dot = !tally ? null
        : single ? el('button.ri-dot.no-drag', {
            class: `ri-dot no-drag s-${st}`,
            title: `${TASK_STATUS_LABEL[st]} — click to ${st === 'done' ? 'reopen' : 'mark done'}`,
            onClick: (e) => { e.stopPropagation(); setTaskStatus(taskKey(a, only), st === 'done' ? 'todo' : 'done', { by: taskEntryBy(a, only) }); },
          }, st === 'done' ? '✓' : st === 'doing' ? '·' : st === 'blocked' ? '!' : '')
        : el('span.ri-tally', { class: 'ri-tally' + (tally.done === tally.total ? ' all' : ''),
            title: `Scheduled ${tally.total} times — open each block to set its status` },
            `${tally.done}/${tally.total}`);
      const rowState = single && st !== 'todo' ? ' st-' + st : (tally && tally.done === tally.total ? ' st-done' : '');
      list.append(el('div.rail-item', { class: `rail-item type-${a.type}${rowState}`, dataset: { activityId: a.id }, title: a.notes || a.name },
        el('div.ri-name', {}, dot, a.name),
        el('div.ri-meta', {}, `${a.duration_min} min`, a.delivery === 'TG' ? el('span.tag.tg', {}, 'TG / patrol') : null,
          a.group === 'C' ? el('span.tag', {}, 'flag') : null, a.soft_vs_hard === 'hard' ? null : el('span.tag.soft', {}, 'soft'),
          a.practice_sd ? el('span.tag', {}, `practice ${a.practice_sd}`) : null,
          n ? el('span.badge', {}, `placed ${n}×`) : null)));
    }
  }
  root.append(list);
  root.append(el('div.rail-foot', {}, el('button.btn', { onClick: onQuickAdd }, '+ Quick activity')));
}
