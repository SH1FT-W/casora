// Language round 14.11.2026, seen in English and Dutch:
//   - the scenes tile „Zuletzt Guten Morgen vor 49 T.“ (and the updates card „Zuletzt <update> gestern“) read
//     „Last Guten Morgen vor 49 T.“: the pattern „Zuletzt (.+)“ took the whole rest as a name, so the age stayed German;
//   - the weather warning „Heute 09:40 AM“ (time in the 12-hour clock of en-US) stayed German: „Heute (\d\d:\d\d)“ knew
//     only 24-hour times. Same for „Gestern …“/„Morgen …“ and 9:40 AM without the leading zero.
// Checks every language with a dashboard table.   node dev/unit/i18n_last_ago_time.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const CC = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, CC), 'utf8');
const DASH = read('scripts/casora-i18n.js');
const tick = () => new Promise((r) => setTimeout(r, 0));
const LANGS = fs.readdirSync(new URL('translations/dashboard/phrases/', CC)).filter((f) => f.endsWith('.json') && f !== 'de.json').map((f) => f.slice(0, -5));

async function dash(language) {
  const H = { hass: { locale: { language } } };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? H : /casora-i18n\.js/.test(q) ? { src: 'http://ha.local/casora_scripts/casora-i18n.js?v=1' } : null), addEventListener() {} };
  const fetchStub = (url) => { const m = /\/i18n\/([a-z]+)\.json/.exec(url); return Promise.resolve(m ? { ok: true, text: async () => read('scripts/i18n/' + m[1] + '.json') } : { ok: false }); };
  const store = new Map();
  const win = { dispatchEvent() {}, addEventListener() {} };
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', 'fetch', 'localStorage', 'location', 'navigator', DASH)(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }, fetchStub,
      { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, { href: 'http://ha.local/x' }, { language: 'de-DE' });
  } catch (e) { /* no browser */ }
  win.casoraTr('Heute');
  await tick(); await tick(); await tick();
  return win.casoraTr;
}

const GERMAN = /\b(vor|Min\.|Std\.|T\.|Tagen|gestern|gerade eben|Heute|Gestern)\b|\bMorgen \d/;
for (const l of LANGS) {
  const tr = await dash(l);
  assert.notEqual(tr('Heute'), 'Heute', l + ': table loaded');
  for (const ago of ['vor 49 T.', 'vor 3 Std.', 'vor 12 Min.', 'gestern', 'gerade eben', 'vor 4 Tagen']) {
    const out = tr('Zuletzt Guten Abend ' + ago);
    assert.ok(!GERMAN.test(out), `${l}: „Zuletzt Guten Abend ${ago}“ → „${out}“ keeps German`);
    assert.ok(out.includes(tr(ago)), `${l}: the age is translated like on its own („${tr(ago)}“): ${out}`);
  }
  for (const [de, t] of [['Heute', '09:40 AM'], ['Heute', '9:40 PM'], ['Heute', '21:05'], ['Gestern', '7:15 AM'], ['Morgen', '10:00 AM'], ['Heute', '9:40\u202fAM']]) {
    const out = tr(de + ' ' + t), ref = tr(de + ' 21:05');
    if (de !== 'Morgen') assert.notEqual(ref, de + ' 21:05', `${l}: 24-hour form translated`);
    assert.equal(out, ref.replace('21:05', t.replace('\u202f', ' ')), `${l}: „${de} ${t}“ like the 24-hour form`);
  }
}
console.log('i18n_last_ago_time: ok (' + LANGS.join(', ') + ')');
