// Security badge before the count exists (Prüfrunde w01-01): after an update HA writes the new templates into an
// open page whose scripts are still the old ones (no window.casoraSecCount before 26.11.29). The badge fell back to
// { level: 'ok' } and showed a green "Alles sicher" next to an unlocked lock. Without the count the badge is neutral
// ("…", grey icon) in both the plain and the soft (Weich/Nebel) branch, never "Alles sicher".
//   node dev/unit/sicherheit_ohne_zaehlung.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_badge_security_group
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_badge_security_group;
const P = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates.casora_badge_security_group;
assert.ok(JSON.stringify(P).includes("if (_sec.pending) sub = '…';"), 'built templates carry the neutral line');
const strip = (t) => t.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (code, win) => new Function('window', 'states', 'hass', 'variables', 'user', 'entity', strip(code))
  .call({}, win, {}, {}, {}, {}, null);

for (const soft of [false, true]) {
  const win = { casoraIconUrl: (n) => '/i/' + n + '.svg' };
  // Soft designs with an old summary helper still loaded: it would say "Alles sicher" for an empty count.
  if (soft) { win._casoraSoft = () => true; win.casoraSecuritySummary = () => ({ text: 'Alles sicher', html: null }); }
  const name = run(T.name, win);
  assert.ok(!/Alles sicher/.test(name), (soft ? 'soft' : 'plain') + ': no "Alles sicher" without a count: ' + name);
  assert.ok(/badge-sub">…</.test(name), (soft ? 'soft' : 'plain') + ': neutral line');
  const col = run(T.styles.card.find((s) => s['--casora-badge-icon-color'])['--casora-badge-icon-color'], win);
  assert.equal(col, 'var(--secondary-text-color)', 'grey icon without a count');
}
// With the count nothing changes: all closed is still "Alles sicher".
const win = { casoraIconUrl: (n) => n, casoraSecCount: () => ({ level: 'ok' }) };
assert.ok(/Alles sicher/.test(run(T.name, win)), 'with a count: all closed reads "Alles sicher"');
console.log('ok sicherheit_ohne_zaehlung');
