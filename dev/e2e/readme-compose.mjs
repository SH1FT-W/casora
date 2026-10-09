// README- und Website-Bilder: setzt die Roh-Screenshots aus docs/images/casora-*-{light,dark}.webp zu
// fertigen Schaubildern zusammen, hell und dunkel. Stil seit 1.2.1 „Produktbühne“: Geräte (Display,
// Tablet, Handy) stehen gerade nebeneinander, unten bündig, auf einem ruhigen warmen Verlauf mit
// Bodenschatten. Nichts schräg, nichts überlappt. Popups zeigt das Display als ganzen Bildschirm in echter
// Größe über dem Dashboard (kein vergrößerter Ausschnitt, sonst wirkt das Popup wie ein Vollbild-Fenster).
// Läuft komplett offline, braucht kein HA.
//
//   Ablauf nach neuen Roh-Bildern:
//   1. CASORA_TOKENS='{…}' /opt/homebrew/opt/node@22/bin/node dev/e2e/screenshots.mjs   (Test-HA im Zustand „demo“)
//   2. /opt/homebrew/opt/node@22/bin/node dev/e2e/readme-compose.mjs [name …]           (offline)
//
// Ohne Namen entstehen alle Bilder, sonst nur die genannten (Namen siehe SCENES).
// Ergebnis: docs/images/<datei>-<light|dark>.webp, Dateiname je Szene in SCENES (readme-* fürs README,
// site-* nur für die Website). Ausnahme „look“: ein Bild je Modus, nur in diesem Modus.
// Umgebung: CASORA_SHOTS_DIR (Quelle und Ziel, Standard docs/images), CASORA_SHOTS_MODES=light,dark,
// CASORA_COMPOSE_MAXKB=400 (Obergrenze je Bild; die WebP-Qualität sinkt, bis es passt).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './harness.mjs';

const REPO = new URL('../../', import.meta.url).pathname;
const DIR = process.env.CASORA_SHOTS_DIR || path.join(REPO, 'docs/images');
const MODES = (process.env.CASORA_SHOTS_MODES || 'light,dark').split(',').filter(Boolean);
const MAX_KB = Number(process.env.CASORA_COMPOSE_MAXKB || 400);
const OUT_W = 1600;
const ONLY = process.argv.slice(2);

const file = (name, mode) => {
  const f = path.join(DIR, `casora-${name}-${mode}.webp`);
  if (!fs.existsSync(f)) throw new Error(`Roh-Bild fehlt: ${f} – erst dev/e2e/screenshots.mjs laufen lassen.`);
  return f;
};
const src = (name, mode) => 'data:image/webp;base64,' + fs.readFileSync(file(name, mode)).toString('base64');

// ── Bausteine ────────────────────────────────────────────────────────────────
// Display: schmaler dunkler Rahmen, gerade, ohne Fuß. crop = [x, y, w, h] in Pixeln der
// 1600 × 1000 großen Quelle (ohne: ganzes Bild). w = Außenbreite in CSS-Pixeln der Bühne.
const display = (img, w, crop = [0, 0, 1600, 1000]) => {
  const pad = Math.round(w * 0.012), inner = w - 2 * pad, s = inner / crop[2];
  return `<div class="display" style="width:${w}px;padding:${pad}px">
    <div class="scr" style="height:${Math.round(crop[3] * s)}px">
      <img src="${img}" style="width:${Math.round(1600 * s)}px;margin-left:${-Math.round(crop[0] * s)}px;margin-top:${-Math.round(crop[1] * s)}px"/>
    </div></div>`;
};
// iPhone (393 × 852 pt): Rahmen, Kamera-Insel, Statusleiste (9:41) und Home-Balken entstehen hier.
const STATUS = `<svg class="sbi" viewBox="0 0 68 12" aria-hidden="true">
  <rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="6" width="3" height="6" rx="1"/>
  <rect x="9" y="3.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="1" width="3" height="11" rx="1"/>
  <path d="M29 3.2a9.6 9.6 0 0 1 12.6 0l-1.3 1.4a7.7 7.7 0 0 0-10 0zM31.2 5.6a6.3 6.3 0 0 1 8.2 0l-1.3 1.4a4.4 4.4 0 0 0-5.6 0zM33.5 8a3 3 0 0 1 3.6 0l-1.8 2z"/>
  <rect x="45.5" y="1" width="19" height="10" rx="3" fill="none" stroke-width="1" style="stroke:currentColor;opacity:.45"/>
  <rect x="47.2" y="2.7" width="13.4" height="6.6" rx="1.6"/><rect x="65.6" y="4.2" width="1.6" height="3.6" rx=".8" style="opacity:.45"/>
</svg>`;
const phone = (img, w, mode) => `
  <div class="phone" style="width:${w}px;padding:${Math.round(w * 0.028)}px"><div class="scr">
    <img class="main" src="${img}"/><div class="island"></div>
    <div class="sb" style="color:${mode === 'dark' ? '#fff' : '#1a1714'}"><span>9:41</span>${STATUS}</div>
    <div class="hi" style="background:${mode === 'dark' ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.72)'}"></div>
  </div></div>`;
// iPad Pro 11" quer: gleichmäßiger schmaler Rand, Kamera mittig an der langen Seite.
const tablet = (img, w) => `
  <div class="tablet" style="width:${w}px;padding:${Math.round(w * 0.024)}px"><i class="cam" style="top:${Math.round(w * 0.012)}px"></i><img src="${img}"/></div>`;

// Popup-Ausschnitt fürs Display: Popup plus gleich breiter Rand ringsum (höchstens M Pixel).
const M = 40;
const popCrop = (b) => {
  const m = Math.max(0, Math.min(M, b[0], b[1], 1600 - b[0] - b[2], 1000 - b[1] - b[3]));
  return [b[0] - m, b[1] - m, b[2] + 2 * m, b[3] + 2 * m];
};
// Größtes Display, das in w × h passt (Ausschnitt-Seitenverhältnis bleibt).
const fit = (crop, w, h) => Math.min(w, Math.round((h / (crop[3] / crop[2])) / (1 - 0.024)));

// ── Szenen ───────────────────────────────────────────────────────────────────
// out: Dateiname ohne Modus, h: feste Höhe (Website-Raster, alle 1600 × 1000). html(m, B) liefert die Geräte der Reihe; B = gemessene Popup-Grenzen.
const popScene = (name) => ({ out: `site-popup-${name}`, h: 1000, html: (m) => display(src(`popup-${name}`, m), 1240) });
const SCENES = {
  hero: { out: 'readme-hero', html: (m) => display(src('desktop', m), 1080) + phone(src('phone', m), 290, m) },
  // Desktop (Raum), Tablet und Handy nebeneinander, unten bündig.
  screens: { out: 'readme-screens', gap: 40, html: (m) => display(src('desktop-room', m), 760) + tablet(src('tablet', m), 480) + phone(src('phone', m), 206, m) },
  // Popups: ganzer Bildschirm mit dem Popup in echter Größe, daneben dasselbe Popup am Handy.
  popups: { out: 'readme-popups', html: (m) => display(src('popup-lights', m), 1060) + phone(src('phone-popup-lights', m), 300, m) },
  popups2: { out: 'readme-popups2', html: (m) => display(src('popup-energy', m), 1060) + phone(src('phone-popup-energy', m), 300, m) },
  studio: { out: 'readme-studio', html: (m) => display(src('studio-tile', m), 1240) },
  // Werkzeuge: Geräte-Assistent und Umzug als Display-Ausschnitt des Dialogs, gleich hoch.
  tools: { out: 'readme-tools', gap: 48, html: (m) => display(src('assistant', m), fit(TOOL_CROP.assistant, 9999, 700), TOOL_CROP.assistant)
    + display(src('move', m), fit(TOOL_CROP.move, 9999, 700), TOOL_CROP.move) },
  // Nur Website
  room: { out: 'site-room', h: 1000, html: (m) => display(src('desktop-room', m), 1240) },
  'pop-lights': popScene('lights'), 'pop-climate': popScene('climate'), 'pop-energy': popScene('energy'),
  'pop-laundry': popScene('laundry'), 'pop-fuel': popScene('fuel'), 'pop-plants': popScene('plants'),
  'studio-phone': { out: 'site-studio-phone', h: 1000, html: (m) => display(src('studio-phone', m), fit(TOOL_CROP.studioPhone, 1240, 800), TOOL_CROP.studioPhone) },
  versions: { out: 'site-versions', h: 1000, html: (m) => display(src('versions', m), 1240) },
  assistant: { out: 'site-assistant', h: 1000, html: (m) => display(src('assistant', m), 1240) },
  move: { out: 'site-move', h: 1000, html: (m) => display(src('move', m), 1240) },
  // „Die Optik“: hell und dunkel nebeneinander auf der Website, je ein Bild im eigenen Modus.
  look: { out: 'site-look', h: 1000, html: (m) => display(src('desktop', m), 1240) },
};
// Dialoge des Studios (Geräte-Assistent, Umzug) liegen fest mittig: Ausschnitt mit 10 px Rand.
// Handy-Vorschau des Studios: Ausschnitt um die Vorschau samt Umschalter darüber.
const TOOL_CROP = { assistant: [468, 61, 664, 939], move: [257, 61, 1086, 939], studioPhone: [430, 70, 740, 860] };
const POPUPS = ['popup-lights', 'popup-climate', 'popup-energy', 'popup-laundry', 'popup-fuel', 'popup-plants'];

// Bühne im Look „Casora“: hell Leinen/Sand mit hellem Kern, dunkel warmes Dunkelbraun.
// Schatten warm statt blau, Geräterahmen in derselben Familie.
const THEME = {
  light: {
    stage: 'radial-gradient(1300px 820px at 50% 16%, #FCF9F4 0%, #F2ECE3 52%, #E6DCCF 100%)',
    shadow: '0 40px 80px -40px rgba(80,58,36,.34), 0 12px 28px -16px rgba(80,58,36,.22)',
    frame: '#1F1B18', floor: 'rgba(80,58,36,.22)',
  },
  dark: {
    stage: 'radial-gradient(1300px 820px at 50% 16%, #3B342E 0%, #29241F 52%, #1C1916 100%)',
    shadow: '0 40px 90px -36px rgba(0,0,0,.72), 0 12px 28px -14px rgba(0,0,0,.52)',
    frame: '#0E0C0B', floor: 'rgba(0,0,0,.58)',
  },
};

const page = (name, mode, B) => {
  const t = THEME[mode], s = SCENES[name];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .stage{position:relative;width:${OUT_W}px;box-sizing:border-box;padding:88px 60px 104px;overflow:hidden;border-radius:32px;background:${t.stage}${s.h ? `;height:${s.h}px;display:flex;flex-direction:column;justify-content:center;padding-top:72px;padding-bottom:88px` : ''}}
  .row{position:relative;display:flex;align-items:flex-end;justify-content:center;gap:${s.gap || 56}px}
  .row>*{position:relative;z-index:1;flex:none}
  .floor{position:absolute;left:8%;right:8%;bottom:-30px;height:52px;border-radius:50%;background:${t.floor};filter:blur(28px);z-index:0}
  img{display:block}
  .display{box-sizing:border-box;border-radius:22px;background:${t.frame};box-shadow:${t.shadow},inset 0 0 0 1.5px rgba(255,255,255,.12)}
  .display .scr{overflow:hidden;border-radius:11px}
  .display .scr img{max-width:none}
  .phone{box-sizing:border-box;border-radius:16.5% / 7.7%;background:${t.frame};box-shadow:${t.shadow},
    inset 0 0 0 1.5px rgba(255,255,255,.16),inset 0 0 0 3px rgba(0,0,0,.5)}
  .phone .scr{position:relative;aspect-ratio:393/852;overflow:hidden;border-radius:14.6% / 6.7%;background:#000;container-type:inline-size}
  .phone .main{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}
  .phone .island{position:absolute;left:50%;top:2.9cqw;width:32cqw;height:9.4cqw;margin-left:-16cqw;border-radius:5cqw;background:#000}
  .phone .sb{position:absolute;left:0;right:0;top:0;height:14.5cqw;display:flex;align-items:center;justify-content:space-between;
    padding:0 8.5cqw 0 12cqw;box-sizing:border-box;font:600 4.3cqw/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;letter-spacing:-.01em}
  .phone .sbi{width:17cqw;fill:currentColor}
  .phone .hi{position:absolute;left:50%;bottom:2cqw;width:34cqw;margin-left:-17cqw;height:1.3cqw;border-radius:1cqw}
  .tablet{position:relative;box-sizing:border-box;border-radius:4.4% / 6.2%;background:${t.frame};box-shadow:${t.shadow},
    inset 0 0 0 1.5px rgba(255,255,255,.14),inset 0 0 0 3px rgba(0,0,0,.5)}
  .tablet img{width:100%;border-radius:2.6% / 3.7%}
  .tablet .cam{position:absolute;left:50%;width:.9%;aspect-ratio:1;margin-left:-.45%;transform:translateY(-50%);border-radius:50%;
    background:radial-gradient(circle at 35% 35%,#2b3a4d,#0b0f14 60%)}
  </style></head><body><div class="stage"><div class="row">${s.html(mode, B)}<div class="floor"></div></div></div></body></html>`;
};

// ── Rendern ──────────────────────────────────────────────────────────────────
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: OUT_W, height: 1200 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const conv = await b.newPage();

// Popup-Grenzen messen: Popup-Fläche (Farbe oben links im Popup) von außen nach innen suchen.
// Casoras Desktop-Popups sind mittig; gesucht werden linke/rechte Kante auf Höhe der Kopfzeile
// und die Unterkante auf der Mittelachse.
async function bounds(name, mode) {
  return conv.evaluate(async (s) => {
    const i = new Image(); i.src = s; await i.decode();
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const px = (x, y) => { const k = (y * c.width + x) * 4; return [d[k], d[k + 1], d[k + 2]]; };
    const near = (q, r, tol = 8) => Math.abs(q[0] - r[0]) + Math.abs(q[1] - r[1]) + Math.abs(q[2] - r[2]) < tol;
    const run = (f, n = 6) => { for (let k = 0; k < n; k++) if (!f(k)) return false; return true; };
    // Oberkante: auf der Spalte x = 450 von oben die erste Zeile, ab der 6 Zeilen gleich bleiben und heller/anders als der Hintergrund sind.
    const ref = px(450, 100);
    let top = 0; for (let y = 20; y < 400; y++) if (run((k) => near(px(450, y + k), ref))) { top = y; break; }
    let left = 0; for (let x = 0; x < 800; x++) if (run((k) => near(px(x + k, top + 40), ref))) { left = x; break; }
    let right = c.width - 1; for (let x = c.width - 1; x > 800; x--) if (run((k) => near(px(x - k, top + 40), ref))) { right = x; break; }
    let bot = c.height - 1; for (let y = c.height - 1; y > top + 200; y--) if (run((k) => near(px(800, y - k), ref))) { bot = y; break; }
    // 2 px nach innen: die Kante selbst ist geglättet.
    return [left + 2, top + 2, right - left - 3, bot - top - 3];
  }, src(name, mode));
}

async function toWebp(png, q) {
  const b64 = await conv.evaluate(async ([s, w, q]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + s;
    await img.decode();
    const k = w / img.naturalWidth;
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, [png.toString('base64'), OUT_W, q]);
  return Buffer.from(b64, 'base64');
}

const names = ONLY.length ? ONLY : Object.keys(SCENES);
const B = {};
for (const n of POPUPS) {
  B[n] = {};
  for (const m of MODES) if (fs.existsSync(path.join(DIR, `casora-${n}-${m}.webp`))) B[n][m] = await bounds(n, m);
}
for (const name of names) {
  if (!SCENES[name]) { console.error(`Unbekanntes Bild: ${name} (${Object.keys(SCENES).join(', ')})`); process.exitCode = 1; continue; }
  for (const mode of MODES) {
    await p.setContent(page(name, mode, B), { waitUntil: 'load' });
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const png = await p.locator('.stage').screenshot({ omitBackground: true });
    let q = 0.9, out = await toWebp(png, q);
    while (out.length > MAX_KB * 1024 && q > 0.5) { q -= 0.06; out = await toWebp(png, q); }
    const f = path.join(DIR, `${SCENES[name].out}-${mode}.webp`);
    fs.writeFileSync(f, out);
    const h = await p.locator('.stage').evaluate((e) => e.offsetHeight);
    console.log(`${path.relative(REPO, f)}  1600×${h}  ${Math.round(out.length / 1024)} KB  (q ${q.toFixed(2)})`);
  }
}
await b.close();
