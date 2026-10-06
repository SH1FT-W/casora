// dashfix (06.10.2026): Hinweise „im Casora Studio zuordnen/zuweisen“ sehen nur Admins – nur sie können das
// Studio öffnen. Andere bekommen einen neutralen Text („Noch nicht eingerichtet“) ohne Sprung ins Studio.
//   node dev/unit/admin_hinweise.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const core = read('scripts/casora-core.js');
const m = core.match(/  window\.casoraIsAdmin = function \(\) \{[\s\S]*?\n  \};\n/);
assert.ok(m, 'casoraIsAdmin fehlt');
const isAdmin = (user) => {
  const window = {};
  const document = { querySelector: () => (user === undefined ? null : { hass: { user } }) };
  new Function('window', 'document', m[0])(window, document);
  return window.casoraIsAdmin();
};
assert.equal(isAdmin({ is_admin: true }), true);
assert.equal(isAdmin({ is_admin: false }), false);
assert.equal(isAdmin(undefined), true, 'unbekannt: wie bisher');
assert.equal(isAdmin(null), true);
// Popup-Leerzustand: Text, Pfeil und Sprung ins Studio nur für Admins.
assert.ok(core.includes("var emptyKind = window.casoraIsAdmin() ? 'Noch kein Gerät zugeordnet' : 'Noch nicht eingerichtet';"));
assert.ok(core.includes("row('Gerät fehlt', window.casoraIsAdmin() ? 'Im Casora Studio neu zuordnen' : 'Gerade nicht verfügbar');"));
assert.ok(/if \(!window\.casoraIsAdmin\(\)\) return;\s*this\.close\(\);\s*history\.pushState\(null, '', '\/casora-studio'\);/.test(core), 'kein Studio-Sprung für Nicht-Admins');
assert.ok(core.includes("(admin ? '<svg class=\"se-chev\""), 'Pfeil nur für Admins');
// Handy-Raum ohne Geräte, Energie ohne Tageswerte, Solar-Tipp ohne Gerät.
assert.ok(read('scripts/filter-overlay.js').includes('if (admin) el.append(h, sub); else el.append(h);'));
assert.ok(read('scripts/local/05-weich-mehr.js').includes("sub: (!window.casoraIsAdmin || window.casoraIsAdmin()) ? 'Im Casora Studio Zähler und Verbraucher zuordnen' : null"));
assert.ok(read('scripts/local/05-standard-medien.js').includes("((window.casoraIsAdmin && !window.casoraIsAdmin()) ? '' : '<div style=\"font-family"));
// Englische Fassungen der neuen Texte vorhanden.
const en = JSON.parse(read('translations/dashboard/phrases/en.json')).exact;
for (const t of ['Noch nicht eingerichtet', 'Gerade nicht verfügbar']) assert.ok(en[t], 'en: ' + t);
console.log('ok admin_hinweise');
