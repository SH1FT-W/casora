// Weather warning texts in other languages (Prüfrunde 26.11.2026):
//  u09-02 the bell row „Wetterwarnung: <kind>“ kept the German lead-in in English, French and Dutch;
//  u09-03 the warning popup's time span „<date> bis <date>“ kept the German „bis“.
// The warning's own name (from the weather service) stays as it comes.
//   node dev/unit/i18n_warning_texts.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#hhmm, dashboards/casora/button_card_templates.json#casora_popup_weather_warning
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/casora-i18n.js');
function trFor(language) {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* no browser */ }
  return win.casoraTr;
}
const plain = (h) => String(h).replace(/<[^>]+>/g, '');

// u09-02: the bell row as 01-basis.js builds it.
const BASIS = read('custom_components/casora/scripts/local/01-basis.js');
assert.match(BASIS, /label: 'Wetterwarnung: ' \+ kind,/, 'bell row label');
const LEAD = { en: 'Weather warning: ', fr: 'Alerte météo : ', nl: 'Weerwaarschuwing: ', es: 'Aviso meteorológico: ',
  it: 'Allerta meteo: ', pl: 'Ostrzeżenie pogodowe: ', pt: 'Aviso meteorológico: ', nb: 'Farevarsel: ' };
for (const [l, lead] of Object.entries(LEAD)) {
  const tr = trFor(l);
  assert.equal(tr('Wetterwarnung: SCHWERE STURMBÖEN').replace(/\u00a0/g, ' '), lead + 'SCHWERE STURMBÖEN', l + ': bell row lead-in');
}

// u09-03: the time span in both list variants of the warning popup.
const TPL = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_popup_weather_warning.tap_action.casora_popup.content;
assert.doesNotMatch(TPL, /' bis ' \+ fmtDateTime/, 'no German „bis“ glued into the date text');
const spans = TPL.match(/fmtDateTime\(w\.effective\)\) \+ '[^']*' \+ esc\(fmtDateTime\(w\.expires\)/g) || [];
assert.equal(spans.length, 2, 'both lists build the span the same way');
const glue = /fmtDateTime\(w\.effective\)\) \+ '([^']*)' \+/.exec(spans[0])[1];
assert.doesNotMatch(TPL, /esc\(subtitle\)/, 'the span is HTML, not escaped a second time');
const html = '<div>Thu · 11/26, 06:03 AM' + glue + 'Thu · 11/26, 02:03 PM</div>';
assert.equal(plain(trFor('en')(html)), 'Thu · 11/26, 06:03 AM to Thu · 11/26, 02:03 PM', 'en span');
assert.doesNotMatch(plain(trFor('fr')(html.replace(/AM|PM/g, ''))), /\bbis\b/, 'fr span');

console.log('ok warning texts');
