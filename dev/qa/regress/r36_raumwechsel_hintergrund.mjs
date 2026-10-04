// @zustand: arbeit
// Gemeldet (#9, 04.10.2026): „Raumansicht zeigt manchmal Home-Hintergrund statt Raumfoto.“
// Am Handy fehlte nach mehrfachem Raumwechsel über die untere Navigation ab und zu die
// Raum-Hintergrundebene: man sah das unscharfe Home-Foto ohne Raumfoto und ohne Schleier, die
// Abschnittsüberschriften der Startseite („Aktuelle Wiedergabe“, „Favoriten“) schienen durch die
// Raumkacheln. Ursache: Wird das Raum-Overlay während des Wechsels ab- und wieder angehängt
// (Neuaufbau der Reihe), lief der Frame des alten Zeigens weiter und setzte „alle anderen“
// Hintergrundebenen auf unsichtbar – darunter die neue eigene.
// Erwartet: nach jedem Wechsel liegt die Ebene des gezeigten Raums im Dokument, ist sichtbar
// (display/opacity), trägt ihr Raumfoto und deckt den ganzen Bildschirm (Home-Überschriften verdeckt).
// WebKit, 390×844, Weich hell, 50 Wechsel über die untere Navigation; jeder zweite mit Neuaufbau.
import { open, casoraDashboard, dashboard, check, need, finish, shot } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const m = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false, theme: 'Casora Weich' });
const pg = m.page;
await dashboard(pg, dash.phone.url, 3);

const nav = await pg.evaluate(() => {
  const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
  if (!n) return null;
  // Nur Räume, deren Overlay ein Raumfoto trägt (darum geht es).
  const ovs = window.__pierce('casora-filter-overlay');
  return n._rooms.map((r) => r.key).filter((k) => ovs.some((o) => o._config && o._config.filter_category === k && o._blurLayerRoomBg));
});
await need('untere Navigation mit mindestens zwei Räumen mit Raumfoto', nav && nav.length >= 2, nav);

// Über die untere Navigation: „Räume“ → Raum (wie am Handy). rebuild: das Overlay des Raums gleich
// danach ab- und wieder anhängen, wie es ein Neuaufbau der Reihe tut.
const tapRoom = (key, rebuild) => pg.evaluate(([key, rebuild]) => {
  const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
  n._bar.querySelector('[data-k="rooms"]').click();
  const items = n._menu ? n._menu.querySelectorAll('.hmn-item') : [];
  const item = items[n._rooms.findIndex((r) => r.key === key)];
  if (item) item.click(); else window._casoraFilter.set(key);
  if (!rebuild) return;
  const o = window.__pierce('casora-filter-overlay').find((x) => x._config && x._config.filter_category === key);
  const w = o && o.parentNode;
  if (w && w.parentNode) { const p = w.parentNode, nx = w.nextSibling; p.removeChild(w); p.insertBefore(w, nx); }
}, [key, rebuild]);

const state = (key) => pg.evaluate((key) => {
  const o = window.__pierce('casora-filter-overlay').find((x) => x._config && x._config.filter_category === key);
  const b = o && o._blurLayerEl;
  const cs = b ? getComputedStyle(b) : null;
  const r = b ? b.getBoundingClientRect() : null;
  return {
    shown: !!(o && o._showing), layer: !!(b && b.isConnected),
    display: cs && cs.display, opacity: cs && +parseFloat(cs.opacity).toFixed(2),
    photo: !!(b && /\/casora_assets\/rooms\//.test(b.style.background || '')),
    covers: !!(r && r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight),
  };
}, key);

const N = 50;
const bad = [];
let prev = null;
for (let i = 0; i < N; i++) {
  let key;
  do { key = nav[Math.floor(Math.random() * nav.length)]; } while (key === prev);
  prev = key;
  await tapRoom(key, i % 2 === 1);
  await pg.waitForTimeout(1300);
  const s = await state(key);
  if (!(s.shown && s.layer && s.display === 'block' && s.opacity > 0.95 && s.photo && s.covers)) {
    bad.push({ i, key, ...s });
    if (bad.length === 1) await shot('fehlt');
  }
}
await check(`Raum-Hintergrundebene nach jedem Wechsel da, sichtbar, mit Foto (${N} Wechsel)`, !bad.length,
  { fehlt: bad.length, beispiele: bad.slice(0, 3) });
await finish();
