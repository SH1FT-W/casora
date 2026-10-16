// Casora 1.3 (11.10.2026): Studio in Inter (lokal mitgeliefert) und Nebel-Kacheln wie Casora.
//   node dev/unit/studio_schrift.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const CC = new URL('../../custom_components/casora/', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, CC), 'utf8');

// Token: nur das Casora-Theme setzt die Studio-Schrift (Nebel erbt sie), die Grundwerte nicht.
const weich = rd('theme_weich.yaml');
const tok = weich.match(/^\s*casora-font-studio:\s*'(.+)'\s*$/m);
assert.ok(tok, 'theme_weich.yaml setzt casora-font-studio');
assert.ok(tok[1].startsWith('"Casora Studio Inter", "Inter"'), 'Inter zuerst: ' + tok[1]);
assert.ok(/system-ui, sans-serif$/.test(tok[1]), 'Rückfall-Stapel bleibt');
assert.ok(!/casora-font-studio/.test(rd('theme.yaml')), 'Grundwerte (theme.yaml) setzen die Studio-Schrift nicht');
assert.ok(!/casora-font-studio/.test(rd('theme_nebel.yaml')), 'Nebel erbt die Studio-Schrift von Casora');

// Schrift lokal: @font-face zeigt auf eine mitgelieferte Datei, keine fremden Server.
const addons = rd('panel/casora-panel-addons.js');
const src = addons.match(/url\("(\/casora_assets\/fonts\/[^"]+\.woff2)"\)/);
assert.ok(src, '@font-face mit lokaler woff2');
const file = new URL('assets/fonts/' + src[1].split('/').pop(), CC);
const size = fs.statSync(file).size;
assert.ok(size > 20000 && size < 60000, 'Schrift schlank (' + size + ' Bytes)');
assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', 'echte woff2');
assert.ok(/SIL Open Font License/.test(rd('assets/fonts/Inter-OFL.txt')), 'Lizenz (OFL) liegt bei');
for (const f of fs.readdirSync(new URL('panel/', CC)).filter((n) => n.endsWith('.js'))) {
  const s = rd('panel/' + f);
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|rsms\.me/.test(s), f + ': keine fremde Schriftquelle');
  // Jede feste System-Schrift im Studio geht über das Token (Rückfallwert = alter Wert).
  const bare = [...s.matchAll(/font:[^;"}]*system-ui[^;"}]*/g)].map((m) => m[0]).filter((x) => !x.includes('var(--casora-font-studio'));
  assert.deepEqual(bare, [], f + ': system-ui ohne Token');
}
assert.ok(/font-family:var\(--casora-font-studio, -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif\)/.test(rd('panel/casora-panel.js')),
  'Studio-Host nimmt das Token, Rückfall SF');

// Nebel: keine eigenen Kachelradien mehr – Kacheln, Handy- und Szenen-Kacheln wie Casora (32).
const nebel = rd('theme_nebel.yaml');
for (const k of ['ha-card-border-radius', 'casora-tile-radius-phone', 'casora-scene-tile-radius']) {
  assert.ok(!new RegExp('^\\s*' + k + ':', 'm').test(nebel), 'Nebel setzt ' + k + ' nicht mehr');
  assert.ok(new RegExp('^\\s*' + k + ': var\\(--casora-r-surface\\)', 'm').test(weich), 'Casora: ' + k + ' = Fläche');
}
console.log('ok studio_schrift');
