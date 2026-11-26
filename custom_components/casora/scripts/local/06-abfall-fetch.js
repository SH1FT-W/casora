// ── Waste calendar fetch (moved out of the casora_trash template) ────────────
// The waste tile and popup need more dates than the sensors give, and the popup is built synchronously, so the
// calendar is fetched ahead: window._casoraTrashFetch(hass, calendarId, force) fills window._casoraTrashCal
// { id, ts, ev } and is kept for 6 h. After a failed fetch (calendar gone, server error) not on every render
// (issue #27): again after 5 s, 15 s, then every minute; opening the popup (force) tries at once, so a short
// outage does not leave it loading. Separate from the calendar tile's own fetch (06-kalender.js, 5 min).
(function () {
  if (window._casoraTrashFetch) return;
  window._casoraTrashFetch = (h, cal, force) => {
    const c = window._casoraTrashCal, f = window._casoraTrashFail;
    if (!h || !h.callApi || window._casoraTrashBusy) return;
    if (c && c.id === cal && Date.now() - c.ts < 6 * 3600000) return;
    if (!force && f && f.id === cal && Date.now() - f.ts < (f.n > 2 ? 60000 : f.n > 1 ? 15000 : 5000)) return;
    window._casoraTrashBusy = true;
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s.getTime() + 400 * 86400000);
    h.callApi('GET', 'calendars/' + cal + '?start=' + encodeURIComponent(s.toISOString()) + '&end=' + encodeURIComponent(e.toISOString()))
      .then((r) => { window._casoraTrashCal = { id: cal, ts: Date.now(), ev: Array.isArray(r) ? r : [] }; window._casoraTrashFail = null; })
      .catch(() => {
        const p = window._casoraTrashFail;
        window._casoraTrashFail = { id: cal, ts: Date.now(), n: p && p.id === cal ? p.n + 1 : 1 };
      })
      .finally(() => { window._casoraTrashBusy = false; });
  };
})();
