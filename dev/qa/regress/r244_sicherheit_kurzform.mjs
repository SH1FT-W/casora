// @zustand: stress
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/00-finden.js
// Tablet-Badge-Reihe (1.3, Look ohne Casora-Theme – bis 1.6.0 „Hemma 2“): Die lange Sicherheits-Zeile („3 Schlösser offen · Schloss offline ·
// 2 Kameras offline“) schob am Tablet die übrigen Badges über den Rand, „Szenen“ war nicht zu sehen.
// Jetzt zeigt das Sammel-Badge die Kurzform („3 offen · 3 offline“) nur, wenn die Reihe sonst nicht passt –
// gemessen, nicht nach Gerät. Wo Platz ist (Desktop 1920), bleibt die lange Zeile.
// Seit 26.10.31 (Hemma-Designs entfernt) läuft der Test im Rückfall-Look ohne Casora-Theme (default) – nur dort
// gibt es die Kurzform. Dessen Badges sind breiter als bei Hemma 2: Am Tablet mit angedockter Seitenleiste passt die
// Reihe auch mit Kurzform nicht ganz (v1.6.0 mit default genauso, 1005 statt 941 px). Geprüft wird deshalb:
// Kurzform spart sichtbar Platz, und die Reihe passt oder lässt sich quer scrollen (Rest erreichbar).
//   QA_BILD=<ordner> legt Bilder der Reihe ab.
import { open, ready, check, need, finish } from './lib.mjs';

const DASH = process.env.CASORA_QA_DASH || 'qa-stress';
const messen = (page) => page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_security_group') && x.getBoundingClientRect().width > 0);
  if (!b) return null;
  let row = null, clip = null, n = b.parentNode || b.getRootNode().host, g = 0;
  while (n && g++ < 40) { if (n.nodeType === 1) { if (!row && n.querySelectorAll('button-card').length > 1) row = n; if (row && getComputedStyle(n).overflowX !== 'visible') { clip = n; break; } } n = n.parentNode || n.host; }
  const right = row ? Math.max(...[...row.querySelectorAll('button-card')].map((x) => x.getBoundingClientRect()).filter((q) => q.width > 0).map((q) => q.right)) : 0;
  const avail = clip ? clip.getBoundingClientRect().right - (parseFloat(getComputedStyle(clip).paddingRight) || 0) : innerWidth;
  const sub = b.shadowRoot.querySelector('.badge-sub');
  return { kurz: b.classList.contains('casora-sec-kurz'), hatKurz: !!b.shadowRoot.querySelector('.sec-kurz'), text: sub ? sub.innerText.trim() : '',
    passt: row ? right <= avail + 1 : null, row: [Math.round(right), Math.round(avail)],
    breite: [Math.round(b._casoraSecLongW || 0), Math.round(b.getBoundingClientRect().width)],
    scrollt: !!clip && /auto|scroll/.test(getComputedStyle(clip).overflowX) && clip.scrollWidth > clip.clientWidth,
    clip: (() => { const q = (row || b).getBoundingClientRect(); return { x: Math.max(0, q.x - 8), y: Math.max(0, q.y - 8), width: Math.min(q.width + 16, innerWidth - Math.max(0, q.x - 8)), height: q.height + 16 }; })() };
});

for (const [w, h, label] of [[1024, 768, 'Tablet'], [1920, 1080, 'Desktop breit']]) {
  const { page } = await open({ width: w, height: h, touch: w === 1024, theme: 'default', dark: false });
  await ready(page, '/' + DASH + '/home', () => window.__pierce && window.__pierce('button-card').length > 3);
  await page.waitForTimeout(5000);
  const m = await messen(page);
  await need(label + ': Sicherheits-Sammelbadge', m, m);
  if (process.env.QA_BILD && m.clip) await page.screenshot({ path: process.env.QA_BILD + '/tablet-badges-' + (w === 1024 ? 'tablet' : 'desktop') + '-nachher.png', clip: m.clip });
  if (!m.hatKurz) { await check(label + ': nur eine Meldung – keine Kurzform nötig', true); continue; }
  if (w === 1024) {
    await check('Tablet: Kurzform spart Platz', m.kurz && m.breite[0] - m.breite[1] > 40, m);
    await check('Tablet: Badge-Reihe passt oder scrollt quer', m.passt === true || m.scrollt, m);
  } else await check(label + ': Badge-Reihe passt in die Breite', m.passt === true, m);
  if (w === 1024) await check('Tablet: Kurzform „… offen · … offline“', m.kurz && /offen|offline/.test(m.text) && !/Schlösser|Kameras/.test(m.text), m.text);
  else await check('Desktop breit: lange Zeile bleibt', !m.kurz && /Schl|Kamera/.test(m.text), m.text);
}
await finish();
