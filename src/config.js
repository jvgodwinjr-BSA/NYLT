// Grid and app constants. Change PACK_ID to run a different content pack.
export const PACK_ID = 'nylt-27-1';
// Cache key for runtime fetches (pack CSVs, roster.enc). Bump with `npm run cache-bust`.
export const ASSET_V = '4';
export const SLOT_MIN = 15;            // the time spine
export const PX_PER_SLOT = 16;         // vertical pixels per 15 minutes
export const DAY_START_MIN = 6 * 60;   // canvas top for a full day
export const DAY_END_MIN = 23 * 60 + 30;
export const GUTTER_PX = 48;
export const LANE_PX = 176;
export const STORAGE_KEY = (packId) => `program-scheduler:v1:${packId}`;
export const TYPE_ORDER = ['presentation', 'meal', 'ceremony', 'meeting', 'outpost', 'game', 'logistics', 'staff_task', 'other'];
