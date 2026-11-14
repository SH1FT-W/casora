// Loads window.casoraCalendars (00-finder.js, block casora-calendars) into a test window: the one rule for which
// calendars count, shared by the calendar tile, the line under the greeting and the screensaver (V26).
import fs from 'node:fs';

export const finderSrc = fs.readFileSync(new URL('../../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');

export function calendarsBlock() {
  const a = finderSrc.indexOf('// casora-calendars:start'), b = finderSrc.indexOf('// casora-calendars:end');
  if (!(a > 0 && b > a)) throw new Error('casora-calendars block not found in 00-finder.js');
  return finderSrc.slice(a, b);
}

export function loadCalendars(win) {
  new Function('window', calendarsBlock())(win);
  return win.casoraCalendars;
}
