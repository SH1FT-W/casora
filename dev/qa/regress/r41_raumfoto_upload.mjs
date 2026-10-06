// @zustand: arbeit
// @parallel: ui   (speichert qa-arbeit zweimal – offene Dashboards anderer Tests laden dabei neu, r36 verlor so den Raum)
// Gemeldet (04.10.2026, Casora 1.0.4): Studio → Raum → Darstellung → Hintergrundbild.
// „Eigene Raumfotos hochladen schlägt fehl bzw. zeigt Fehler. Wenn es klappt, ist das neue Foto
// nicht auswählbar, erst nach Neuladen der Seite.“
// Ursachen: Die Antwort des Uploads listete nur den eigenen Ordner (ohne Beispielfotos) und ein
// Foto ohne Tagbild gar nicht; die Liste wurde in einen evtl. schon ersetzten Abschnitt gezeichnet;
// der Raum wurde nicht als geändert markiert; über 12 MB, HEIC oder Dateien ohne passende Endung
// wurden abgelehnt; PNG/WebP landeten als .png/.webp, das Dashboard lädt aber immer <name>.jpg.
// Erwartet: Klick und Ziehen laden hoch, das Foto ist sofort gewählt und sichtbar (Tag/Nacht),
// große Fotos gehen durch, HEIC gibt eine klare Meldung (oder wird umgewandelt), das Dashboard
// findet <name>.jpg und <name>-night.jpg, Speichern + Neuladen behält das Foto.
// Testbilder: CASORA_RAUMFOTOS (Ordner) mit klein.jpg, „Wohn zimmer ä.png“, gross.jpg (> 12 MB),
// iphone.HEIC – fehlen sie, werden sie mit Python/Pillow bzw. sips erzeugt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { open, studio, casoraDashboard, check, need, finish, BASE } from './lib.mjs';

const DIR = process.env.CASORA_RAUMFOTOS || path.join(os.tmpdir(), 'casora-raumfotos');
fs.mkdirSync(DIR, { recursive: true });
const F = { small: path.join(DIR, 'klein.jpg'), png: path.join(DIR, 'Wohn zimmer ä.png'),
  big: path.join(DIR, 'gross.jpg'), heic: path.join(DIR, 'iphone.HEIC') };
if (!fs.existsSync(F.small) || !fs.existsSync(F.png) || !fs.existsSync(F.big)) {
  execFileSync('python3', ['-c', `
from PIL import Image, ImageFilter
d = ${JSON.stringify(DIR)}
Image.radial_gradient("L").resize((1600, 1000)).convert("RGB").save(d + "/klein.jpg", quality=90)
Image.new("RGB", (1200, 800), (40, 120, 200)).save(d + "/Wohn zimmer ä.png")
Image.effect_noise((5000, 3400), 60).convert("RGB").filter(ImageFilter.GaussianBlur(0.6)).save(d + "/gross.jpg", quality=96)
`]);
}
if (!fs.existsSync(F.heic)) {
  try { execFileSync('sips', ['-s', 'format', 'heic', F.small, '--out', F.heic], { stdio: 'ignore' }); } catch (e) { /* kein sips */ }
}

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
// CASORA_R41_PHONE=1: dasselbe am Handy (390×844, Touch).
const s = await open(process.env.CASORA_R41_PHONE ? { width: 390, height: 844, mobile: true } : {});
const pg = s.page;
await studio(pg, dash.url);

// Raum mit mitgeliefertem Beispielfoto (kein eigenes), Darstellung offen.
const show = () => pg.evaluate(() => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  let i = rooms.findIndex((r, n) => n > 0 && /^qa-raumfoto/.test((r.variables || {}).image || ''));
  if (i < 0) i = rooms.findIndex((r, n) => n > 0 && /-demo$/.test((r.variables || {}).image || ''));
  if (i < 0) i = 1;
  p._room = i; p._sel = null; p._renderTabs(); p._renderForm();
  if (!p.__stSpy) {
    p.__stSpy = true; window.__st = [];
    const o = p._status.bind(p);
    p._status = (m, k) => { window.__st.push([String(m || ''), k || '']); return o(m, k); };
  }
  return { i, path: rooms[i].path, image: (rooms[i].variables || {}).image };
});
const room0 = await show();
await need('Raum mit Hintergrundbild-Feld', await pg.evaluate(() => window.__panel().shadowRoot.querySelectorAll('.shots .shot').length === 2));

const slot = (n) => pg.evaluate((n) => {
  const b = window.__panel().shadowRoot.querySelectorAll('.shots .shot')[n];
  if (!b) return null;
  const img = b.querySelector('img');
  return { src: img ? img.getAttribute('src') : '', connected: b.isConnected };
}, n);

// Namensfrage beantworten (Feld leeren, Namen tippen, bestätigen).
const answer = async (name) => {
  await pg.waitForFunction(() => !!window.__panel().shadowRoot.querySelector('.askcard input'), null, { timeout: 15000 });
  const r = await pg.evaluate((name) => {
    const box = window.__panel().shadowRoot.querySelector('.askcard');
    const input = box.querySelector('input');
    const was = input.value;
    if (name !== null) { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); }
    const btns = box.querySelectorAll('.askacts button:not(.ghost)');
    btns[btns.length - 1].click();
    return was;
  }, name);
  return r;
};

const settled = async () => {
  await pg.waitForFunction(() => {
    const st = window.__st || [];
    const last = st[st.length - 1];
    return last && (last[1] === 'ok' || last[1] === 'err') && !/…|\.\.\./.test(last[0]);
  }, null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(600);
  return pg.evaluate(() => {
    const p = window.__panel();
    const room = p._state.compact.rooms[p._room];
    const st = window.__st; window.__st = [];
    const input = p.shadowRoot.querySelector('.shots') && p.shadowRoot.querySelector('.shots').previousElementSibling
      && p.shadowRoot.querySelector('.shots').previousElementSibling.querySelector('input');
    return { image: room.variables.image, last: st[st.length - 1] || null, all: st,
      list: (p._imgs || []).map((i) => i.name), demo: (p._imgs || []).some((i) => /-demo$/.test(i.name)),
      combo: input ? input.value : null, dirty: p._isDirty() };
  });
};

// Hochladen per Klick: Dateiauswahl am Platz „Tag“.
const byClick = async (n, file, name) => {
  const [fc] = await Promise.all([
    pg.waitForEvent('filechooser', { timeout: 10000 }),
    pg.evaluate((n) => window.__panel().shadowRoot.querySelectorAll('.shots .shot')[n].click(), n),
  ]);
  await fc.setFiles(file);
  const was = await answer(name);
  return { was, ...(await settled()) };
};

// Hochladen per Ziehen auf einen Platz (echtes drop-Ereignis mit DataTransfer).
const byDrop = async (n, file, name, type) => {
  const b64 = fs.readFileSync(file).toString('base64');
  await pg.evaluate(([n, b64, fname, type]) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], fname, { type }));
    const b = window.__panel().shadowRoot.querySelectorAll('.shots .shot')[n];
    b.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [n, b64, path.basename(file), type]);
  const was = await answer(name);
  return { was, ...(await settled()) };
};

const NAME = 'qa-raumfoto';

// (1) Klick, JPG, Tag
const a = await byClick(0, F.small, NAME);
await check('Klick-Upload (JPG, Tag) ohne Fehler', a.last && a.last[1] === 'ok', a.last);
await check('neues Foto sofort in der Auswahl und gewählt', a.image === NAME && a.list.includes(NAME), { image: a.image, has: a.list.includes(NAME) });
await check('Beispielfotos bleiben nach dem Upload in der Auswahl', a.demo);
await check('Auswahlfeld zeigt das neue Foto', a.combo && !/not on disk|nicht vorhanden/i.test(a.combo) && a.combo !== room0.image, a.combo);
await check('Raum gilt als geändert (Speichern übernimmt es)', a.dirty);
const d1 = await slot(0);
await check('Vorschau Tag zeigt das neue Foto', d1 && d1.connected && d1.src.includes(NAME + '.jpg'), d1);

// (2) Ziehen, PNG mit Umlaut und Leerzeichen, Nacht (Name vorbelegt = gewähltes Foto)
const b = await byDrop(1, F.png, null, 'image/png');
await check('Ziehen-Upload (PNG, Umlaut/Leerzeichen, Nacht) ohne Fehler', b.last && b.last[1] === 'ok', b.last);
await check('Name beim Ziehen ist das gewählte Foto vorbelegt', b.was === NAME, b.was);
const d2 = await slot(1);
await check('Vorschau Nacht zeigt das neue Foto', d2 && d2.src.includes(NAME + '-night.jpg'), d2);
await check('Foto bleibt gewählt', b.image === NAME, b.image);

// (3) große Datei (> 12 MB) per Klick, Tag
const c = await byClick(0, F.big, NAME);
await check('großes Foto (' + (fs.statSync(F.big).size / 1048576).toFixed(1) + ' MB) wird angenommen', c.last && c.last[1] === 'ok', c.last);

// (4) HEIC per Ziehen: umgewandelt oder klare Meldung
if (fs.existsSync(F.heic)) {
  const h = await byDrop(0, F.heic, 'qa-raumfoto-heic', 'image/heic');
  const ok = h.last && (h.last[1] === 'ok' ? h.list.includes('qa-raumfoto-heic') : /JPG/i.test(h.last[0]) && /HEIC/i.test(h.last[0]));
  await check('HEIC: umgewandelt oder klare Meldung „als JPG exportieren“', ok, h.last);
  if (h.last && h.last[1] === 'ok') {
    await pg.evaluate((n) => { const p = window.__panel(); p._state.compact.rooms[p._room].variables.image = n; p._renderForm(); }, NAME);
  }
}

// (4b) Neuer Name nur auf den Platz „Nacht“: sofort wählbar (gilt auch tagsüber).
const n = await byDrop(1, F.small, 'qa-raumfoto-nur nacht', 'image/jpeg');
await check('neuer Name nur mit Nachtfoto sofort gewählt und in der Auswahl', n.last && n.last[1] === 'ok'
  && n.image === 'qa-raumfoto-nur-nacht' && n.list.includes('qa-raumfoto-nur-nacht'), { last: n.last, image: n.image });
await pg.evaluate((nm) => { const p = window.__panel(); p._state.compact.rooms[p._room].variables.image = nm; p._renderForm(); }, NAME);

// (5) Das Dashboard lädt <name>.jpg und <name>-night.jpg über /casora_assets.
const urls = await pg.evaluate(async (n) => {
  const r = {};
  for (const u of [`/casora_assets/rooms/${n}.jpg`, `/casora_assets/rooms/${n}-night.jpg`]) {
    const res = await fetch(u, { cache: 'no-store' });
    const buf = new Uint8Array(await res.arrayBuffer());
    r[u] = { status: res.status, jpeg: buf[0] === 0xff && buf[1] === 0xd8, kb: Math.round(buf.length / 1024) };
  }
  return r;
}, NAME);
await check('Dashboard findet Tag- und Nachtfoto als JPEG', Object.values(urls).every((x) => x.status === 200 && x.jpeg), urls);
await check('großes Foto verkleinert (unter 3 MB)', urls[`/casora_assets/rooms/${NAME}.jpg`].kb < 3072, urls);

// (6) Speichern → neu laden → bleibt
const saved = await pg.evaluate(async () => { const p = window.__panel(); await p._save(); return !p._isDirty(); });
await check('gespeichert', saved);
await pg.reload();
await studio(pg, dash.url);
const after = await show();
await check('nach Neuladen bleibt das Foto gewählt', after.image === NAME, after);
const d3 = await slot(0);
await check('nach Neuladen zeigt die Vorschau das Foto', d3 && d3.src.includes(NAME + '.jpg'), d3);

// Aufräumen: altes Foto zurück.
await pg.evaluate(async (img) => { const p = window.__panel(); p._state.compact.rooms[p._room].variables.image = img; p._markDirty(); await p._save(); }, room0.image);
await finish();
