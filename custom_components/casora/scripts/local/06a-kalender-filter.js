// Calendar rules shared by the Agenda tile, the greeting, the screensavers and the Studio's Agenda tile preview.
// Loaded before 06-kalender.js on the dashboard. The Studio's Agenda tile preview loads only this file,
// so the Studio gets no calendar module (event cache, popup) from it.
(function () {
  if (window.casoraCalendarAllows) return;
  // The calendar popup keeps every event. settings: the object to read the words from (the Studio passes
  // its settings draft); omitted, the saved settings. attrs: the calendar state's attributes; a recorded
  // decision there (casora_filter_match.message, from the mock's replay) counts only for the entries that are
  // still in the filter: its matches name the entries that hit the title when it was recorded.
  window.casoraCalendarAllows = function (title, settings, attrs) {
    var words = settings || (window.casoraSettings ? window.casoraSettings() : {});
    var entries = String(words.calendar_filter || '').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
    var decided = attrs && attrs.casora_filter_match && attrs.casora_filter_match.message;
    if (decided && Array.isArray(decided.matches)) {
      return !decided.matches.some(function (m) { return entries.indexOf(String(m).trim().toLowerCase()) !== -1; });
    }
    var text = String(title || '').toLowerCase();
    return !entries.some(function (entry) { return text.indexOf(entry) !== -1; });
  };
  // The Agenda tile's pick (Upstream's rule): one event per calendar from the calendar states (message,
  // start_time, all_day). A running event wins, then the earliest start. cals: [{ entity, tile }] (tile false is
  // left out); allows(title) skips filtered titles, so a filtered state event leaves its calendar out.
  window.casoraCalendarNext = function (states, cals, now, allows) {
    var best = null;
    (cals || []).forEach(function (c) {
      if (c.tile === false) return;
      var s = states[c.entity], a = s && s.attributes;
      if (!a || !a.message || !a.start_time) return;
      if (allows && !allows(a.message, a)) return;
      var st = new Date(String(a.start_time).replace(' ', 'T')), en = new Date(String(a.end_time || a.start_time).replace(' ', 'T'));
      if (isNaN(st)) return;
      var ev = { name: a.message, start: st, end: en, allDay: !!a.all_day, on: s.state === 'on', cal: c };
      if (!ev.on && en < now) return;
      if (!best || (ev.on && !best.on) || (ev.on === best.on && st < best.start)) best = ev;
    });
    return best;
  };
})();
