// @zustand: arbeit
// @parallel: ui
// Neu (08.10.2026, 1.1.1): Fußball-Kachel aus einem Team-Tracker-Sensor. Im Testhaus gibt es einen erfundenen
// Sensor (dev/casora_mock/fussball.py: FC Nordhafen gegen SV Lindenberg); der Studio-Assistent legt dafür eine
// Fußball-Kachel auf die Startseite. ESPN (Tabelle, Form, nächstes Spiel) wird im Browser abgefangen und mit
// festen Daten beantwortet (dev/qa/fussball-espn.mjs) – der Test braucht kein Internet.
// Erwartet am Desktop und Handy (hell + dunkel): Wappen in der Kachel, Gegnerwappen am Kreis, Statustext in der
// Ecke auf Höhe der Kreismitte (vor dem Spiel „in … Tagen“, live rot mit Minute und rotem Punkt, nach dem Spiel
// „Endstand“), Zustandszeile einzeilig; Antippen öffnet das Popup mit Wappen im Ring, Spielkasten, Tabelle
// (eigenes Team markiert, „Ganze Tabelle“ ≥ 44 px) und Form (5 Spiele), darunter die letzten 5 Duelle mit dem
// Gegner; am Desktop endet die rechte Spalte bündig mit der Tabelle (Wunsch 08.10.2026: unten rechts viel Luft).
import { open, casoraDashboards, dashboard, check, need, finish, fakeStates, stable } from './lib.mjs';
import { espnRoute } from '../fussball-espn.mjs';

const ID = 'sensor.fc_nordhafen';
const all = await casoraDashboards();
const has = (d) => JSON.stringify(d.config).includes('casora_football');
const desk = all.find((d) => !d.mobile && has(d));
const phone = all.find((d) => d.mobile && has(d));
await need('Dashboards mit Fußball-Kachel (Assistent)', desk && phone, all.map((d) => d.url));

const viewOf = (d) => {
  const v = (d.config.views || []).findIndex((x) => JSON.stringify(x).includes('casora_football'));
  return (d.config.views[v] || {}).path || v;
};
// Kachel messen: Lage, Ecke, Wappen, Zustandszeile.
const MEASURE = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_football')
    && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const sr = b.shadowRoot, r = b.getBoundingClientRect();
  const cell = sr.querySelector('#img-cell'), img = cell && cell.querySelector('img');
  const pill = sr.querySelector('.cfb-pill'), dot = pill && pill.querySelector('i');
  const st = sr.querySelector('#state'), nm = sr.querySelector('#name');
  const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const after = cell ? getComputedStyle(cell, '::after') : null;
  return {
    x: r.x + r.width / 2, y: r.y + r.height / 2, card: box(b), cell: box(cell), pill: box(pill),
    img: img ? img.getAttribute('src') : null, imgOk: !!(img && img.complete && img.naturalWidth > 0),
    // Wappen sichtbar, nicht vom Aus-Symbol (Maske „?“ in #img-cell::before) verdeckt.
    imgOp: img ? Number(getComputedStyle(img).opacity) : 0, maskOp: cell ? Number(getComputedStyle(cell, '::before').opacity) : 1,
    opp: after ? after.display : null, pillText: pill ? pill.textContent.trim() : '', live: !!(pill && pill.classList.contains('live')),
    pillOn: !!(pill && pill.classList.contains('on')), pillBg: pill ? getComputedStyle(pill).backgroundColor : null,
    pillColor: pill ? getComputedStyle(pill).color : null, dotColor: dot ? getComputedStyle(dot).backgroundColor : null,
    state: st ? st.textContent.trim() : '', stateH: st ? st.getBoundingClientRect().height : 0,
    stateLine: st ? parseFloat(getComputedStyle(st).lineHeight) || 0 : 0, name: box(nm),
    haptic: ((b._config || {}).tap_action || {}).haptic || null,
    active: getComputedStyle(sr.querySelector('ha-card')).getPropertyValue('--casora-active-overlay-opacity').trim() === '1',
  };
};
const measure = (pg) => pg.evaluate(MEASURE);
const red = (c) => { const v = rgb(c); return !!v && v[0] > 150 && v[0] > v[1] + 60 && v[0] > v[2] + 50; };
// Farbe als [r, g, b, a] – auch color(srgb …), so liefert der Browser color-mix() zurück.
const rgb = (c) => {
  const k = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(c || '');
  if (k) return [k[1] * 255, k[2] * 255, k[3] * 255, k[4] === undefined ? 1 : +k[4]];
  const m = /(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?/.exec(c || '');
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
};
const filled = (c) => { const v = rgb(c); return !!v && v[3] > 0.5; };
const lum = (v) => { const f = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]); };
const contrast = (a, b) => { const x = rgb(a), y = rgb(b); if (!x || !y) return 0; const p = lum(x), q = lum(y); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };

const VIEWS = [
  ['Desktop', { width: 1600, height: 1000, scale: 1, dark: false }, desk, false],
  ['Handy hell', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: false }, phone, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, phone, true],
];
for (const [tag, o, d, mobile] of VIEWS) {
  const { page, context } = await open({ ...o, theme: 'Casora' });
  const calls = await espnRoute(context);
  await dashboard(page, d.url + '/' + viewOf(d), 3);
  // Vor dem Spiel (Mock: übermorgen) – Zustand fest unterschieben, damit der Test nicht von der Uhrzeit abhängt.
  const kick = new Date(Date.now() + 2 * 86400000); kick.setHours(18, 30, 0, 0);
  await fakeStates(page, { [ID]: { state: 'PRE', attributes: { date: kick.toISOString(), team_score: '0', opponent_score: '0' } } }, { sticky: true });
  let m = await stable(page, MEASURE);
  await need(tag + ': Fußball-Kachel gefunden', m);
  await check(tag + ': Wappen geladen', m.imgOk && /^data:image\/svg/.test(m.img || ''), m.img && m.img.slice(0, 30));
  await check(tag + ': Wappen sichtbar (kein Aus-Symbol darüber)', m.imgOp >= 0.95 && m.maskOp === 0, { img: m.imgOp, mask: m.maskOp });
  await check(tag + ': Gegnerwappen am Kreis', m.opp === 'block', m.opp);
  await check(tag + ': Tippen mit Vibration', !!m.haptic, m.haptic);
  await check(tag + ': Spiel übermorgen – Kachel nicht aktiv', !m.active, m.active);
  if (!mobile) {
    await check(tag + ': vor dem Spiel „in 2 Tagen“ in der Ecke', /in 2 Tagen/.test(m.pillText), m.pillText);
    await check(tag + ': Ecke auf Höhe der Kreismitte', m.pill && Math.abs((m.pill.t + m.pill.b) / 2 - (m.cell.t + m.cell.b) / 2) <= 2, { pill: m.pill, cell: m.cell });
    await check(tag + ': Ecke in der Kachel', m.pill && m.pill.r <= m.card.r - 8 && m.pill.t >= m.card.t, { pill: m.pill, card: m.card });
    await check(tag + ': nicht aktiv – Ecke ohne Fläche', !m.pillOn && !filled(m.pillBg), m.pillBg);
  }
  await check(tag + ': Zustandszeile einzeilig', m.stateH > 0 && m.stateH <= m.stateLine * 1.5 + 1, { h: m.stateH, lh: m.stateLine, t: m.state });
  // Kleine Handy-Kachel: nur Tag und Anstoß (Gegner als Wappen am Kreis).
  await check(tag + ': vor dem Spiel Tag, Anstoß' + (mobile ? '' : ', Gegner'), mobile ? /^\S+ 18:30$/.test(m.state) : /18:30 · gegen (SV Lindenberg|LIN)/.test(m.state), m.state);

  // Live: 2:1 in der 67. Minute.
  await fakeStates(page, { [ID]: { state: 'IN', attributes: { date: new Date(Date.now() - 70 * 60000).toISOString(), team_score: '2', opponent_score: '1', clock: "67'" } } }, { sticky: true });
  m = await stable(page, MEASURE);
  if (!mobile || m.pill) {
    await check(tag + ': live – Minute in der Ecke', m.live && /67/.test(m.pillText), { t: m.pillText, c: m.pillColor });
    // Wahl 08.10.2026 (G): aktiv wird die Ecke eine gefüllte rote Pille mit weißer Schrift (≥ 4,5:1).
    await check(tag + ': live – Ecke als gefüllte rote Pille', m.pillOn && filled(m.pillBg) && red(m.pillBg), m.pillBg);
    await check(tag + ': live – Schrift auf der Pille lesbar (≥ 4,5:1)', contrast(m.pillColor, m.pillBg) >= 4.5, { c: m.pillColor, bg: m.pillBg, cr: contrast(m.pillColor, m.pillBg) });
  }
  await check(tag + ': live – Spielstand', /2:1/.test(m.state), m.state);
  await check(tag + ': live – Kachel aktiv (Spieltag)', m.active, m.active);

  // Nach dem Spiel (heute): Endstand.
  await fakeStates(page, { [ID]: { state: 'POST', attributes: { date: new Date(Date.now() - 150 * 60000).toISOString(), team_score: '2', opponent_score: '1', clock: 'FT' } } }, { sticky: true });
  m = await stable(page, MEASURE);
  await check(tag + ': nach dem Spiel – Sieg', /2:1/.test(m.state) && (mobile || /Sieg/.test(m.state)), m.state);
  // Endstand am Spieltag, danach der Wochentag (Spiel 2,5 Std. her – kurz nach Mitternacht schon gestern).
  const sameDay = new Date(Date.now() - 150 * 60000).toDateString() === new Date().toDateString();
  if (!mobile) await check(tag + ': nach dem Spiel – Ecke ' + (sameDay ? '„Endstand“' : 'Wochentag'), sameDay ? /Endstand/.test(m.pillText) : /^(Mo|Di|Mi|Do|Fr|Sa|So)$/.test(m.pillText), m.pillText);

  // Popup: Antippen (unter Last bis zu 4 Mal, wie r80).
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  for (let t = 0; t < 4 && !(await offen()); t++) {
    const at = (await measure(page)) || m;
    if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': Popup geöffnet', await offen());
  const p = await stable(page, () => {
    const s = window.casoraPopup.surface, S = s.getBoundingClientRect();
    const ring = window.__pierce('.header-ring .im')[0];
    const rows = window.__pierce('.cfb-r:not(.h)');
    const me = rows.find((r) => /FC Nordhafen/.test(r.textContent));
    const more = window.__pierce('.cfb-more')[0];
    return { surf: { l: S.left, r: S.right }, vw: innerWidth,
      ring: ring ? ring.getAttribute('src').slice(0, 20) : null, ringOk: !!(ring && ring.complete && ring.naturalWidth > 0),
      match: (window.__pierce('.cfb-m')[0] || {}).textContent || '', rows: rows.length, me: me ? me.className : null,
      more: more ? more.getBoundingClientRect().height : 0, form: window.__pierce('.cfb-f:not(.d):not(.h)').length,
      duels: window.__pierce('.cfb-f.d').filter((n) => n.getBoundingClientRect().height > 0).length,
      // Unterkanten: letzte Tabellenzeile, Fußzeile der Tabelle (Legende), rechte Spalte; Abstand der Duell-Zeilen.
      last: (window.__pierce('.cfb-r:not(.h)').pop() || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().bottom,
      lb: (window.__pierce('.cfb-table > .cfb')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().bottom,
      rb: (window.__pierce('.cfb-form > .cfb')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().bottom,
      hf: (window.__pierce('.cfb-f:not(.d):not(.h)')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().height,
      hd: (window.__pierce('.cfb-f.d')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().height,
      // Spaltenköpfe und erste Zeilen links (Tabelle) und rechts (Form) – oben bündig (08.10.2026).
      th: (window.__pierce('.cfb-r.h')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().top,
      fh: (window.__pierce('.cfb-f.h')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().top,
      t1: (window.__pierce('.cfb-r:not(.h)')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().top,
      f1: (window.__pierce('.cfb-f:not(.d):not(.h)')[0] || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().top };
  }, null, { max: 10000, quiet: 900 });
  await check(tag + ': Popup – Wappen im Ring', p.ringOk && /^data:image/.test(p.ring || ''), p.ring);
  await check(tag + ': Popup – Spielkasten mit beiden Teams', /FC Nordhafen/.test(p.match) && /SV Lindenberg/.test(p.match), p.match.slice(0, 120));
  await check(tag + ': Popup – Tabelle mit eigenem Team', p.rows >= 8 && !!p.me, { rows: p.rows, me: p.me });
  await check(tag + ': Popup – „Ganze Tabelle“ ≥ 44 px', p.more >= 44, p.more);
  await check(tag + ': Popup – Form mit 5 Spielen', p.form === 5, p.form);
  await check(tag + ': Popup – Duelle unter der Form, Zeilen gleich hoch wie die Form', p.duels >= 2 && p.duels <= 5 && Math.abs(p.hd - p.hf) <= 0.5, { n: p.duels, hf: p.hf, hd: p.hd });
  if (mobile) await check(tag + ': Popup – Handy (untereinander): alle 5 Duelle', p.duels === 5, p.duels);
  // Desktop: Unterkante rechts höchstens eine halbe Zeile (29 px) von der letzten Tabellenzeile, nie unter der Legende.
  else await check(tag + ': Popup – rechte Spalte endet auf Höhe der letzten Tabellenzeile', Math.abs(p.rb - p.last) <= 29 && p.rb <= p.lb + 0.5, { tabelle: p.last, rechts: p.rb, legende: p.lb });
  if (!mobile) await check(tag + ': Popup – Spaltenkopf der Form auf Höhe des Tabellenkopfs, erste Zeilen bündig',
    Math.abs(p.fh - p.th) <= 1 && Math.abs(p.f1 - p.t1) <= 1, { th: p.th, fh: p.fh, t1: p.t1, f1: p.f1 });
  if (process.env.R81_BILD) await page.screenshot({ path: `${process.env.CASORA_OUT}/r81_${tag.replace(/[^a-z0-9]+/gi, '_')}.png` });
  await check(tag + ': Popup im Fenster', p.surf.l >= -1 && p.surf.r <= p.vw + 1, p);
  await check(tag + ': ESPN nur abgefangen (kein Netz)', calls.length > 0 && calls.every((u) => /site\.api\.espn\.com/.test(u)), calls.length);
  await context.close();
}
await finish();
