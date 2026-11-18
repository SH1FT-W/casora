// Calendar filter: the title rule for Home, the greeting, the screensavers and the Agenda tile.
// Loaded before 06-kalender.js on the dashboard. The Studio's Agenda tile preview loads only this file,
// so the Studio gets no calendar module (event cache, popup) from it.
(function () {
  if (window.casoraCalendarAllows) return;
  // The calendar popup keeps every event. settings: the object to read the words from (the Studio passes
  // its settings draft); omitted, the saved settings.
  window.casoraCalendarAllows = function (title, settings) {
    var words = settings || (window.casoraSettings ? window.casoraSettings() : {});
    var text = String(title || '').toLowerCase();
    return !String(words.calendar_filter || '').split(',').some(function (entry) {
      entry = entry.trim().toLowerCase();
      return entry && text.indexOf(entry) !== -1;
    });
  };
})();
