// CSV in the Presentations Authority column order, so the scheduler's clock flows back to the sheet:
// Practice SD (as assigned, or inferred from where it is placed) and Practice date/time (from the placement).
import { state, activities, resourceLabel } from '../state.js?v=5';
import { toCsv } from '../csv.js?v=5';
import { downloadText } from '../store/localStore.js?v=5';
import { fmt12, dayLabel } from '../util.js?v=5';

export const AUTHORITY_COLUMNS = ['Presentation', 'Delivery', 'Syllabus day', 'Short description', 'Owner', "Who's required", 'Practice SD', 'Practice date/time', 'Ready', 'Group', 'Time allowed', 'Last year (25-1)', 'Recommended presenter', 'Recommended location'];
const GROUP = { A: 'A — Troop (main hall)', B: 'B — Patrol / TG', C: 'C — Flag / ceremony' };
const WHO = { troop: 'All participants (troop)', patrol: 'Troop Guides (patrol delivery)', staff: 'Staff' };

export function sheetSyncRows() {
  const sds = state.pack.events.filter((e) => /^SD/i.test(e.id)).map((e) => e.id);
  return activities().filter((a) => a.type === 'presentation' && a.source === 'authority').map((a) => {
    const practice = state.placements.filter((p) => p.activity_id === a.id && sds.includes(p.event_id)).sort((x, y) => x.day.localeCompare(y.day) || x.start_min - y.start_min);
    const inAssigned = practice.find((p) => p.event_id === a.practice_sd);
    const first = inAssigned ?? practice[0];
    const practiceSd = a.practice_sd || first?.event_id || '';
    const when = first ? `${dayLabel(first.day)} ${fmt12(first.start_min)}${first.event_id !== practiceSd ? ` (${first.event_id})` : ''}` : '';
    const desc = (a.notes ?? '').split(' | 26-1 observed')[0];
    return { Presentation: a.name, Delivery: a.delivery === 'TG' ? 'Patrol (TG)' : 'Troop', 'Syllabus day': a.syllabus_day ?? '', 'Short description': desc,
      Owner: a.owner_id ? resourceLabel(a.owner_id) : '', "Who's required": a.group === 'C' ? 'Assigned presenter + troop at assembly' : (WHO[a.audience] ?? ''),
      'Practice SD': practiceSd, 'Practice date/time': when, Ready: a.ready || 'Not started', Group: GROUP[a.group] ?? a.group, 'Time allowed': a.group === 'C' ? '' : `${a.duration_min} Minutes`,
      'Last year (25-1)': '', 'Recommended presenter': '', 'Recommended location': a.location ?? '' };
  });
}

export function exportSheetSyncCsv() {
  downloadText(toCsv(sheetSyncRows(), AUTHORITY_COLUMNS), `presentations-authority-sync-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
}
