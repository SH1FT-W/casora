// Tippen-Feedback der Badges einheitlich wie bei den Kacheln (leicht, haptic: light).
//   node dev/unit/badge_haptic.mjs
// Gemeldet 04.10.2026 (iPhone): Manche Badges vibrierten beim Antippen, andere nicht – Sicherheit,
// Klima, Personen, Medien (oben am Handy und im Raum-Kopf), Medien-Player und Aktivität hatten
// kein haptic, Beleuchtung und Energie schon. Prüft ohne Browser die Vorlagen, wie button-card sie
// zusammenführt (Vorlagen der Reihe nach, dann die Karte selbst, Objekte verschmolzen): Jede
// Badge-Karte, deren Tippen etwas tut, gibt leichtes Feedback.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const all = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const merge = (a, b) => { const out = { ...a }; for (const k of Object.keys(b)) out[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; return out; };
const resolve = (name, seen = new Set()) => {
  const t = all[name]; if (!t || seen.has(name)) return {}; seen.add(name);
  let base = {}; [].concat(t.template || []).forEach((p) => { base = merge(base, resolve(p, seen)); });
  const own = { ...t }; delete own.template; return merge(base, own);
};
const acts = (ta) => !!ta && ta.action !== undefined && ta.action !== 'none';
const bad = [];

// Badge-Vorlagen selbst
Object.keys(all).filter((k) => /^casora_badge_/.test(k)).forEach((k) => {
  const ta = resolve(k).tap_action;
  if (acts(ta) && !ta.haptic) bad.push(k);
});

// Badges in den Reihen (Handy oben, Handy-Raum, Raum-Kopf am Desktop)
for (const host of ['casora_mobile_filter_badges', 'casora_mobile_sensor_chips', 'casora_room']) {
  const walk = (x, p) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y, i) => walk(y, p + '.' + i)); return; }
    const tpl = [].concat(x.template || []);
    if (tpl.some((t) => /^casora_badge_/.test(t))) {
      let r = {}; tpl.forEach((t) => { r = merge(r, resolve(t)); });
      r = merge(r, x);
      if (acts(r.tap_action) && !r.tap_action.haptic) bad.push(host + p + ' (' + tpl.join('+') + ')');
    }
    Object.entries(x).forEach(([k, v]) => walk(v, p + '.' + k));
  };
  walk(all[host].custom_fields, '');
}

assert.deepEqual(bad, [], 'Badges ohne Tippen-Feedback:\n  ' + bad.join('\n  '));
console.log('ok badge_haptic');
