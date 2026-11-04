// Checkup 2026-10: Schloss-Popup „Akku NaN %“ und Übergangszustände ohne englische Fassung.
//   node dev/unit/checkup_vorlagen_akku_auslassung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;

// 1) Schloss-Popup: Akku-Prozent aus unavailable/unknown ist null, nicht NaN. (The tiles that computed battPct were the
// renderer without window._casoraUI, gone with HACS review 5; the rows show the battery only when it is a number.)
{
  const c = T.casora_popup_lock.tap_action.casora_popup.content;
  const m = c.match(/const b = batt\[id\] \? parseFloat\(states\[batt\[id\]\]\?\.state\) : NaN;/);
  assert.ok(m, 'battery line of the lock rows found');
  assert.match(c, /if \(!isNaN\(b\)[^\n]*bits\.push\('Akku ' \+ Math\.round\(b\) \+ ' %'\)/, 'battery bit only for a number');
  const bit = (state) => { const batt = { 'lock.x': 'sensor.akku' }, id = 'lock.x';
    const states = state === undefined ? {} : { 'sensor.akku': { state } };
    const b = new Function('batt', 'id', 'states', m[0] + ' return b;')(batt, id, states);
    return isNaN(b) ? null : Math.round(b); };
  assert.equal(bit('unavailable'), null);
  assert.equal(bit('unknown'), null);
  assert.equal(bit(''), null);
  assert.equal(bit(undefined), null);
  assert.equal(bit('42.6'), 43);
  assert.equal(bit('0'), 0);
}
console.log('ok Akku ohne NaN');

// 2) Übergangszustände: Deutsch mit Leerzeichen vor „…“ (Wortliste V9) und mit englischer Fassung.
{
  const all = JSON.stringify(T).replace(/\\+u2026/g, '…');
  assert.doesNotMatch(all, /[A-Za-zÄÖÜäöüß]…/, 'keine Auslassung direkt am Wort in den Vorlagen');
  const TEXTE = {
    casora_popup_lock: ['Wird verriegelt …', 'Wird entriegelt …', 'Wird geöffnet …'],
    casora_cover: ['Öffnet sich …', 'Schließt sich …'],
    casora_popup_cover: ['Öffnet sich …', 'Schließt sich …'],
  };
  for (const [name, texte] of Object.entries(TEXTE)) {
    const s = JSON.stringify(T[name]).replace(/\\+u2026/g, '…');
    for (const t of texte) assert.ok(s.includes(t), name + ': ' + t);
  }

  const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: 'en' } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM-Wächter ohne Browser */ }
  const tr = win.casoraTr;
  assert.ok(tr, 'casoraTr geladen');
  for (const [de, en] of [
    ['Wird verriegelt …', 'Locking…'],
    ['Wird entriegelt …', 'Unlocking…'],
    ['Wird geöffnet …', 'Opening…'],
    ['Öffnet sich …', 'Opening…'],
    ['Schließt sich …', 'Closing…'],
    // 3) Energie-Popup, Autarkie-Zeile
    ['Laut Anker-App', 'According to the Anker app'],
  ]) assert.equal(tr(de), en, de);
}
console.log('ok Übergangszustände und Anker-Zeile auf Englisch');
