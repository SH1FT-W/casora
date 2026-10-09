// @zustand: arbeit
// @parallel: allein
// Gemeldet 09.10.2026 (1.2.1): Kamera-Kacheln zeigen das Kamerabild nur sporadisch, obwohl die Kameras
// liefern. Ursache: das Standbild lädt per fetch und setzt danach host._hcPic; das Neuzeichnen per
// requestUpdate() ohne Eigenschaft ignoriert button-card 7 (shouldUpdate). Im Theme Casora (Weich) blieb
// die Kachel so leer mit Kamerasymbol, bis sich die Kamera-Entität zufällig wieder änderte.
// Erwartet (Desktop und Handy, Theme Casora): Bild erscheint auch bei langsamer Kamera, bleibt nach
// Token-Wechsel sichtbar, ein Fehler blendet ein liegendes Bild nicht aus, nach Fehlern ohne Bild kommt
// es wieder, und es wird ohne Token-Wechsel aufgefrischt.
// Legt eine neutrale REST-Kamera und das Dashboard qa-kamera-bild an und räumt ab. Die Standbilder kommen
// aus page.route (Verlaufsbild, je Abruf anders), der Server kennt nur den jeweils gültigen Token.
import zlib from 'node:zlib';
import { open, usePage, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';

const URL_PATH = 'qa-kamera-bild';
const CAM = 'camera.qa_bild_kamera', CAM2 = 'camera.qa_bild_kamera_zwei';
const pic = (id, t) => `/api/camera_proxy/${id}?token=${t}`;

// Kleines PNG mit Farbverlauf (nicht einfarbig, sonst gilt es in Weich als Platzhalter).
const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
const crc = (b) => { let r = 0xffffffff; for (const x of b) r = T[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(seed, w = 64, h = 36) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w + seed) & 255; raw[o + 1] = y * 255 / h; raw[o + 2] = 128; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const src = await casoraDashboard();
await need('Casora-Dashboard als Vorlage', src);
const roomView = src.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('Raumansicht', roomView);

// „Server“: je Kamera gültiger Token, verzögerte und fehlschlagende Antworten.
const S = { [CAM]: { token: 'a1', delay: 0, fail: 0, n: 0 }, [CAM2]: { token: 'x1', delay: 0, fail: 0, n: 0 } };
const route = async (r) => {
  const u = new URL(r.request().url());
  const id = decodeURIComponent(u.pathname.split('/').pop());
  const s = S[id];
  if (!s) return r.continue();
  s.n++;
  if (s.delay) await new Promise((res) => setTimeout(res, s.delay));
  if (u.searchParams.get('token') !== s.token) return r.fulfill({ status: 401, body: '' });
  if (s.fail > 0) { s.fail--; return r.fulfill({ status: 500, body: '' }); }
  return r.fulfill({ status: 200, contentType: 'image/png', body: png(s.n * 37) });
};

const first = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(first.page);
const H0 = (fn, arg) => first.page.evaluate(fn, arg);
await dashboard(first.page, src.url + '/' + (src.config.views[0].path || '0'));
const setState = (id, token) => H0(async ([i, t, p]) => {
  await document.querySelector('home-assistant').hass.callApi('POST', 'states/' + i,
    { state: 'idle', attributes: { friendly_name: 'QA Bild', access_token: t, entity_picture: p } });
}, [id, token, pic(id, token)]);
const cleanup = () => H0(async ([u, ids]) => {
  const h = document.querySelector('home-assistant').hass;
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (d.url_path === u) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  for (const id of ids) { try { await h.callApi('DELETE', 'states/' + id); } catch (e) { /* fehlt schon */ } }
}, [URL_PATH, [CAM, CAM2]]);
await cleanup();
atFinish(cleanup);
await setState(CAM, 'a1');
await setState(CAM2, 'x1');

const cfg = JSON.parse(JSON.stringify(src.config));
const view = JSON.parse(JSON.stringify(roomView));
view.cards[2].cards = [
  { type: 'custom:button-card', template: 'casora_camera', entity: CAM, name: 'QA Kamera' },
  { type: 'custom:button-card', template: 'casora_camera', entity: CAM2, name: 'QA Kamera Zwei' },
];
view.path = 'raum';
cfg.views = [view];
await H0(async ([u, c]) => {
  const h = document.querySelector('home-assistant').hass;
  const l = await h.callWS({ type: 'lovelace/dashboards/list' });
  if (!l.some((d) => d.url_path === u)) await h.callWS({ type: 'lovelace/dashboards/create', url_path: u,
    title: 'QA Kamerabild', mode: 'storage', require_admin: false, show_in_sidebar: false });
  await h.callWS({ type: 'lovelace/config/save', url_path: u, config: c });
}, [URL_PATH, cfg]);

// Lage einer Kachel: liegt das Bild sichtbar (Hintergrund mit Blob), Text, Kamerasymbol.
const look = (pg, id) => pg.evaluate((i) => {
  const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === i && x.shadowRoot
    && x.shadowRoot.querySelector('ha-card') && x.getBoundingClientRect().width > 0);
  if (!b) return null;
  const c = b.shadowRoot.querySelector('ha-card');
  const blob = (b.style.getPropertyValue('--casora-cam-img').match(/blob:[^")]+/) || [''])[0];
  const img = b.shadowRoot.querySelector('img');
  return { shown: /var\(--casora-cam-img|blob:/.test(getComputedStyle(c).backgroundImage) && !!blob, blob,
    pic: b._hcPic, text: c.innerText.replace(/\s+/g, ' ').trim(), icon: !!(img && /camera\.svg/.test(img.src || '')) };
}, id);
const until = async (pg, fn, max) => {
  let v; for (const t0 = Date.now(); Date.now() - t0 < max; await pg.waitForTimeout(250)) { v = await fn(); if (v.ok) return v; }
  return v;
};
const seen = async (pg, id, max = 4000) => until(pg, async () => { const l = await look(pg, id); return { ok: !!(l && l.shown), ...l }; }, max);

for (const mobile of [false, true]) {
  const tag = mobile ? 'Handy' : 'Desktop';
  const o = mobile ? await open({ width: 390, height: 844, mobile: true, dark: false, theme: 'Casora' }) : first;
  const page = o.page;
  usePage(page);
  await page.route('**/api/camera_proxy/**', route);
  Object.assign(S[CAM], { token: 'a1', delay: 0, fail: 0 });
  Object.assign(S[CAM2], { token: 'x1', delay: 0, fail: 0 });
  await setState(CAM, 'a1');
  await setState(CAM2, 'x1');
  // 1) Langsame Kamera (wie Reolink E1: 2–10 s): Bild kommt, nachdem die Kachel schon steht.
  //    Kamera Zwei liefert zuerst zweimal einen Fehler (Kamera wacht noch auf).
  S[CAM].delay = 4500;
  S[CAM2].fail = 2;
  await dashboard(page, URL_PATH + '/raum', 1);
  const a = await seen(page, CAM, 6000);
  await check(`${tag}: langsames Bild erscheint ohne Zustandswechsel`, a.ok && !a.icon && /Live/.test(a.text || ''), a);
  const a2 = await seen(page, CAM2, 9000);
  await check(`${tag}: nach zwei Fehlern kommt das Bild wieder`, a2.ok && !a2.icon, a2);
  S[CAM].delay = 0;

  // 2) Token-Wechsel: alter Token ungültig, Bild bleibt und wird neu geladen.
  const b0 = await look(page, CAM);
  S[CAM].token = 'b2';
  await setState(CAM, 'b2');
  await page.waitForTimeout(300);
  const b1 = await look(page, CAM);
  await check(`${tag}: während des Token-Wechsels bleibt das Bild`, b1 && b1.shown, b1);
  const b2 = await until(page, async () => { const l = await look(page, CAM); return { ok: !!(l && l.shown && l.blob !== b0.blob), ...l }; }, 4000);
  await check(`${tag}: nach dem Token-Wechsel neues Bild`, b2.ok, b2);

  // 3) Ein Fehler (500) beim nächsten Abruf blendet das liegende Bild nicht aus.
  S[CAM].token = 'c3'; S[CAM].fail = 1;
  await setState(CAM, 'c3');
  await page.waitForTimeout(1200);
  const c1 = await look(page, CAM);
  await check(`${tag}: ein Fehler blendet das Bild nicht aus`, c1 && c1.shown && !/Kein Bild/.test(c1.text), c1);
  const c2 = await until(page, async () => { const l = await look(page, CAM); return { ok: !!(l && l.shown && l.blob !== c1.blob), ...l }; }, 6000);
  await check(`${tag}: nach dem Fehler wieder ein neues Bild`, c2.ok, c2);

  // 4) Seite lange offen, kein Token-Wechsel: das Bild wird trotzdem aufgefrischt.
  if (!mobile) {
    const n0 = S[CAM].n;
    const d = await until(page, async () => { const l = await look(page, CAM); return { ok: !!(l && l.shown && l.blob !== c2.blob), ...l }; }, 14000);
    await check(`${tag}: Bild frischt sich ohne Token-Wechsel auf`, d.ok && S[CAM].n > n0, { ...d, abrufe: S[CAM].n - n0 });
  }
  if (mobile) await o.browser.close().catch(() => {});
}
usePage(first.page);
await finish();
