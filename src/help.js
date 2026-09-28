// In-app help, and the printable card that shares its text.
//
// 23 of the 30 roles on this course are held by youth staff, and they will not open a manual in a
// Drive folder. So the help lives behind a `?` in the header, where it is read at the moment of
// need and can never go stale — and the same sections print to one page for the weekends
// themselves, where the signal at camp is poor and paper wins.
//
// One source, two outputs: `card: true` marks the sections short enough to matter on the printed
// page. Everything else shows in the overlay only.
//
// The shared password is deliberately not written here. A card handed to two dozen teenagers gets
// photographed and forwarded, and at that point encrypting the roster has bought nothing.
import { el, clear } from './util.js?v=7';

export const HELP = [
  {
    h: 'What this is',
    card: true,
    p: ['The plan for every NYLT weekend — who is doing what, and when. Everyone with the password sees the same copy, so when you change something, everyone has it.'],
  },
  {
    h: 'Getting in',
    card: true,
    p: ['Open the site and enter the shared password. **Ask your ACD for it** — it is not written on this card.',
        'Without it the schedule still shows, but people appear as role codes like TG-1 instead of names, and nothing you do is shared.'],
  },
  {
    h: 'Find your jobs',
    card: true,
    steps: ['Tap **Staff tasks** in the row of buttons at the top left.',
            'Type your weekend in the search box — `sd3` finds everything for SD3.',
            'That is your list.'],
  },
  {
    h: 'Tick one off',
    card: true,
    steps: ['Tap the little circle to the left of a job.',
            'It turns green and the job gets a line through it. That is it — it saves itself.',
            'Tapped the wrong one? Tap it again to un-do it.'],
    note: 'Tick **Hide finished tasks** to make the list shrink as you go.',
  },
  {
    h: 'What the colours mean',
    card: true,
    dl: [['Green circle', 'Done.'],
         ['Blue circle', 'Someone has started it.'],
         ['Red circle', 'Stuck — waiting on something or someone.'],
         ['Empty circle', 'Nobody has started it yet.'],
         ['A red block on the schedule', 'Two things clash. Tell your ASPL; do not just move it.']],
  },
  {
    h: 'The green number',
    card: true,
    p: ['Open the **Progress** tab on the right. It tells you how far **ahead** the team is — how much is finished compared with what the calendar actually needed by today.',
        'It starts at zero and climbs. Every job you finish early pushes it up. SD3 alone needs about 40 jobs, so working ahead now is what keeps that weekend from being miserable.'],
  },
  {
    h: 'Is it saved?',
    card: true,
    p: ['Yes — it saves a second after you stop. Look at the top right: **✓ saved to site** means everyone can see it.',
        'If it says **browser only**, your changes are stuck on your own phone. Enter the password to fix it.'],
  },
  {
    h: 'Moving things on the schedule',
    p: ['Drag an activity from the left onto a lane. Drag a block to move it, or drag its bottom edge to make it longer.',
        'Lanes run side by side: **TG & Presenters** and **Quartermasters** work at the same time. **All Hands** blocks (like meals) span everything, because at meals we are all together.',
        'Nothing is ever refused — if a move causes a clash, it lands anyway and turns red so a person can decide.'],
  },
  {
    h: 'If two of you edit at once',
    p: ['Whoever saves first wins, and the second person gets a banner offering **Use theirs**, **Keep mine**, or **Save mine to a file**. Nobody is silently overwritten.',
        'Other people’s changes appear within about twenty seconds, as long as you have nothing unsaved.'],
  },
  {
    h: 'Printing it',
    p: ['**Export → Print / Save as PDF** gives you the run of show for the weekend you are looking at. Worth doing before you leave for camp, where the signal is poor.'],
  },
  {
    h: 'Something looks wrong',
    card: true,
    p: ['Tell your ASPL or the ACD. Do not delete things to tidy up — a wrong block is easy to fix, a deleted one is not.'],
  },
];

/** Bold **like this** and code `like this`, without reaching for a Markdown library. */
const rich = (s) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean)
  .map((part) => (part.startsWith('**') ? el('strong', {}, part.slice(2, -2))
    : part.startsWith('`') ? el('code', {}, part.slice(1, -1))
    : part));

function section(s, { cardOnly = false } = {}) {
  if (cardOnly && !s.card) return null;
  return el('section.help-s', {},
    el('h3', {}, s.h),
    s.p?.map((t) => el('p', {}, rich(t))),
    s.steps ? el('ol', {}, s.steps.map((t) => el('li', {}, rich(t)))) : null,
    s.dl ? el('dl.help-dl', {}, s.dl.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])) : null,
    // A trailing aside, after the steps it refers to rather than above them.
    s.note ? el('p.help-note', {}, rich(s.note)) : null);
}

/** The printable one-pager, rendered into #print-view. Only the `card` sections. */
export function renderHelpCard(root) {
  clear(root);
  root.append(
    el('h1', {}, 'Using the Program Scheduler'),
    el('p.muted', {}, 'A one-page guide for staff. Ask your ACD for the shared password — it is deliberately not printed here.'),
    el('div.help-card', {}, HELP.map((s) => section(s, { cardOnly: true })).filter(Boolean)));
}

/**
 * The `?` overlay. `onPrint` hands control back to main.js, which owns #print-view — this module
 * stays out of deciding what else is on the page.
 */
export function showHelp({ onPrint } = {}) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = el('div.gate.help-gate', { onClick: (e) => { if (e.target === overlay) close(); } },
    el('div.help-box', {},
      el('h2', { style: { margin: '0 0 2px' } }, 'How to use this'),
      el('p.muted', { style: { margin: 0 } }, 'Everyone with the password sees the same schedule.'),
      el('div.help-body', {}, HELP.map((s) => section(s))),
      el('div', { style: { display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' } },
        el('button.btn.primary', { onClick: close }, 'Got it'),
        el('button.btn', { onClick: () => { close(); onPrint?.(); } }, 'Print the one-page version'))));
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  return overlay;
}
