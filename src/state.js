// Single in-memory state + undo stack. Drag-and-drop only ever mutates `placements` (and custom activities).
import { uid } from './util.js?v=13';
import { normalizeActivity } from './pack.js?v=13';

export const state = {
  pack: null, eventId: null,
  view: 'all', dayIndex: 0,
  placements: [], customActivities: [],
  tasks: {}, // activity id -> { status, by, at, note }. Absent means `todo`.
  selectedId: null,
  filters: { q: '', type: '', unplacedOnly: false, hideDone: false },
  fileDirty: false, lastFileSave: null,
  roster: null, // Map<resource id, display name> once unlocked
};

const subs = new Set();
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
export const emit = (what = 'all') => subs.forEach((fn) => fn(what));

const undoStack = [], redoStack = [];
const snapshot = () => JSON.stringify({ placements: state.placements, customActivities: state.customActivities, tasks: state.tasks });
const restore = (s) => Object.assign(state, JSON.parse(s));
export function mutate(fn) {
  undoStack.push(snapshot()); if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  fn(); state.fileDirty = true; emit('data');
}
export function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); state.fileDirty = true; emit('data'); }
export function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); state.fileDirty = true; emit('data'); }
export const canUndo = () => undoStack.length > 0;

export const activities = () => [...state.pack.activities, ...state.customActivities];
export const activityById = (id) => activities().find((a) => a.id === id);
export const currentEvent = () => state.pack.events.find((e) => e.id === state.eventId);
export const eventPlacements = (eventId = state.eventId) => state.placements.filter((p) => p.event_id === eventId);
export const resourceLabel = (id) => state.roster?.get(id) ?? id;
export const resourceById = (id) => state.pack.resources.find((r) => r.id === id);

export function addPlacement({ activity_id, event_id, track_id, day, start_min, duration_min, resource_ids }) {
  const a = activityById(activity_id);
  const p = { id: uid(), activity_id, event_id, track_id, day, start_min,
    duration_min: duration_min ?? a.duration_min,
    resource_ids: resource_ids ?? (a.owner_id ? [a.owner_id] : []), flags: [], notes: '' };
  mutate(() => state.placements.push(p));
  return p;
}
export function updatePlacement(id, patch) { mutate(() => Object.assign(state.placements.find((p) => p.id === id), patch)); }
export function removePlacement(id) { mutate(() => { state.placements = state.placements.filter((p) => p.id !== id); if (state.selectedId === id) state.selectedId = null; }); }
export function addCustomActivity(a) { mutate(() => state.customActivities.push(normalizeActivity(a))); }
export function replaceSchedule({ placements = [], customActivities = [], tasks = {} }) { mutate(() => { state.placements = placements; state.customActivities = customActivities.map(normalizeActivity); state.tasks = tasks ?? {}; state.selectedId = null; }); }

/**
 * Set (or clear) a task's status. `todo` removes the entry, so the map only ever holds real
 * changes and a task dropped from the catalog stops taking up room.
 *
 * `by` is a role id — never a typed name. The roster turns it into a display name in the browser;
 * the stored JSON and every export carry only the role, which is what keeps this inside the same
 * rule as resources.csv.
 */
export function setTaskStatus(activityId, status, { by = '', note = '' } = {}) {
  mutate(() => {
    const next = { ...state.tasks };
    if (!status || status === 'todo') delete next[activityId];
    else next[activityId] = { status, ...(by ? { by } : {}), ...(note ? { note } : {}), at: new Date().toISOString() };
    state.tasks = next;
  });
}
export function select(id) { state.selectedId = id; emit('selection'); }
export function setEvent(id) { state.eventId = id; state.selectedId = null; state.dayIndex = 0; emit('view'); }
export function setView(view, dayIndex = state.dayIndex) { state.view = view; state.dayIndex = dayIndex; emit('view'); }
export function setFilters(patch) { Object.assign(state.filters, patch); emit('filters'); }
