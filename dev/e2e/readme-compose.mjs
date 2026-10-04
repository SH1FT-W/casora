// README-Bilder: setzt die Roh-Screenshots aus docs/images/casora-*-{light,dark}.webp zu
// fertigen Schaubildern zusammen (Geräterahmen, Schatten, Leinen-/Dunkelbraun-Bühne im Look „Casora Weich“), hell und dunkel:
// docs/images/readme-<name>-<light|dark>.webp. Läuft komplett offline, braucht kein HA.
//
//   Ablauf nach neuen Roh-Bildern:
//   1. CASORA_TOKENS='{…}' /opt/homebrew/opt/node@22/bin/node dev/e2e/screenshots.mjs   (Test-HA im Zustand „demo“)
//   2. /opt/homebrew/opt/node@22/bin/node dev/e2e/readme-compose.mjs [name …]           (offline)
//
// Ohne Namen entstehen alle Bilder (hero screens popups studio tools), sonst nur die genannten.
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

const src = (name, mode) => {
  const f = path.join(DIR, `casora-${name}-${mode}.webp`);
  if (!fs.existsSync(f)) throw new Error(`Roh-Bild fehlt: ${f} – erst dev/e2e/screenshots.mjs laufen lassen.`);
  return 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
};

// ── Bausteine ────────────────────────────────────────────────────────────────
// Fenster mit Titelleiste (Browser/Studio). crop: Ausschnitt der Quelle in Quell-Pixeln.
const browser = (img, w, { url = 'homeassistant.local', style = '' } = {}) => `
  <div class="win" style="width:${w}px;${style}">
    <div class="bar"><i></i><i></i><i></i><span>${url}</span></div>
    <img src="${img}" />
  </div>`;
// iPhone (15 Pro, 393 × 852 pt): das Roh-Bild ist nur der Inhalt zwischen Statusleiste (59 pt)
// und Home-Balken (34 pt), siehe screenshots.mjs. Rahmen, Kamera-Insel, Statusleiste und Balken
// entstehen hier; die Ränder oben/unten füllt eine unscharfe Kopie des Bildes.
const STATUS = `<svg class="sbi" viewBox="0 0 68 12" aria-hidden="true">
  <rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="6" width="3" height="6" rx="1"/>
  <rect x="9" y="3.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="1" width="3" height="11" rx="1"/>
  <path d="M29 3.2a9.6 9.6 0 0 1 12.6 0l-1.3 1.4a7.7 7.7 0 0 0-10 0zM31.2 5.6a6.3 6.3 0 0 1 8.2 0l-1.3 1.4a4.4 4.4 0 0 0-5.6 0zM33.5 8a3 3 0 0 1 3.6 0l-1.8 2z"/>
  <rect x="45.5" y="1" width="19" height="10" rx="3" fill="none" stroke-width="1" style="stroke:currentColor;opacity:.45"/>
  <rect x="47.2" y="2.7" width="13.4" height="6.6" rx="1.6"/><rect x="65.6" y="4.2" width="1.6" height="3.6" rx=".8" style="opacity:.45"/>
</svg>`;
const phone = (img, w, style = '') => `
  <div class="phone" style="width:${w}px;padding:${Math.round(w * 0.028)}px;${style}"><div class="scr">
    <img class="main" src="${img}" />
    <div class="island"></div><div class="sb"><span>9:41</span>${STATUS}</div><div class="hi"></div>
  </div></div>`;
// iPad Pro 11" quer: schmaler, gleichmäßiger Rand, Kamera mittig an der langen Seite.
const tablet = (img, w, style = '') => `
  <div class="tablet" style="width:${w}px;padding:${Math.round(w * 0.024)}px;${style}"><i class="cam" style="top:${Math.round(w * 0.012)}px"></i><img src="${img}" /></div>`;

// Schwebende Karte aus einem Ausschnitt (x, y, w, h in Pixeln der 1600 px breiten Quelle).
const card = (img, [x, y, cw, ch], w, style = '') => {
  const s = w / cw;
  return `<div class="card" style="width:${w}px;height:${Math.round(ch * s)}px;${style}">
    <img src="${img}" style="width:${Math.round(1600 * s)}px;margin-left:${-Math.round(x * s)}px;margin-top:${-Math.round(y * s)}px" /></div>`;
};

// Popup-Ausschnitt der Desktop-Aufnahmen (1600 × 1000): das Glas-Popup ohne verwischten Hintergrund.
// Alle Popups sind gleich breit und mittig; die Höhe folgt dem höheren der beiden.
const POPUP = [300, 71, 1000, 919];

// Maße in CSS-Pixeln einer 1600 px breiten Bühne; gerendert wird doppelt so scharf und dann verkleinert.
const SCENES = {
  hero: { h: 1000, html: (m) => `
    ${browser(src('desktop', m), 1220, { style: 'left:90px;top:80px' })}
    ${phone(src('phone', m), 300, 'right:110px;top:200px')}` },
  // Desktop, iPad an der Wand und iPhone nebeneinander, unten bündig.
  screens: { h: 720, html: (m) => `
    ${browser(src('desktop-room', m), 780, { style: 'left:50px;bottom:75px' })}
    ${tablet(src('tablet', m), 540, 'left:760px;bottom:75px')}
    ${phone(src('phone', m), 236, 'left:1318px;bottom:75px')}` },
  // Zwei Popups für Geräte, die fast jeder hat: Licht (Räume, Helligkeit, Farben) und
  // Raumklima (Tagesverlauf, Werte, Hinweis). Als Fenster, leicht versetzt.
  // 1.0.3: vier Popups als versetzte Fenster-Collage wie „tools“ (Licht, Wäsche, Energie, Sicherheit).
  popups: { h: 1040, html: (m) => `
    ${browser(src('popup-lights', m), 680, { style: 'left:70px;top:60px' })}
    ${browser(src('popup-laundry', m), 680, { style: 'right:70px;top:36px' })}
    ${browser(src('popup-energy', m), 640, { style: 'left:160px;top:545px' })}
    ${browser(src('popup-security', m), 700, { style: 'right:130px;top:505px' })}` },
  // Zweites Popup-Bild: Pflanzen und Raumklima.
  popups2: { h: 640, html: (m) => `
    ${browser(src('popup-plants', m), 720, { style: 'left:60px;top:60px' })}
    ${browser(src('popup-climate', m), 720, { style: 'right:60px;top:110px' })}` },
  studio: { h: 1000, html: (m) => `
    ${browser(src('studio', m), 1180, { url: 'Casora Studio', style: 'left:70px;top:70px' })}
    ${browser(src('studio-tile', m), 700, { url: 'Casora Studio · Tile', style: 'right:60px;top:430px' })}` },
  // Studio-Werkzeuge als versetzte Fenster-Collage (bewusst kein Raster).
  tools: { h: 1040, html: (m) => `
    ${browser(src('setup-look', m), 680, { url: 'Setup assistant', style: 'left:70px;top:60px' })}
    ${browser(src('versions', m), 680, { url: 'Versions', style: 'right:70px;top:36px' })}
    ${browser(src('assistant', m), 640, { url: 'Device assistant', style: 'left:160px;top:545px' })}
    ${browser(src('move', m), 700, { url: 'Move from Hemma', style: 'right:130px;top:505px' })}` },
};

// Bühne im Look „Casora Weich“ (Farben wie theme_weich.yaml und die Website):
// hell Leinen/Sand mit einem Hauch Ton und Honig, dunkel warmes Dunkelbraun. Schatten warm
// statt blau, Fensterleisten und Geräterahmen in derselben Familie.
const THEME = {
  light: {
    bg: `radial-gradient(1000px 700px at 6% -4%, rgba(255,252,246,.95), transparent 70%),
         radial-gradient(900px 700px at 104% 12%, rgba(182,122,80,.16), transparent 70%),
         radial-gradient(1000px 640px at 46% 116%, rgba(232,176,74,.13), transparent 70%),
         linear-gradient(165deg, #F6F1E9, #ECE4D8)`,
    bar: '#FBF8F3', barText: '#8E8174', barLine: 'rgba(120,100,80,.14)', url: '#F0E9DF',
    dots: ['#E0D6C9', '#E0D6C9', '#E0D6C9'],
    shadow: '0 44px 90px -26px rgba(90,65,40,.40), 0 14px 32px -14px rgba(90,65,40,.24)',
    frame: '#26211D',
  },
  dark: {
    bg: `radial-gradient(1000px 700px at 6% -4%, rgba(242,235,225,.07), transparent 70%),
         radial-gradient(900px 700px at 104% 12%, rgba(217,162,122,.15), transparent 70%),
         radial-gradient(1000px 640px at 46% 116%, rgba(217,162,122,.08), transparent 70%),
         linear-gradient(165deg, #322D28, #211E1B)`,
    bar: '#2E2A26', barText: 'rgba(205,194,180,.62)', barLine: 'rgba(230,214,194,.16)', url: '#3A352F',
    dots: ['#4A443D', '#4A443D', '#4A443D'],
    shadow: '0 44px 100px -24px rgba(0,0,0,.78), 0 14px 32px -12px rgba(0,0,0,.6)',
    frame: '#100E0C',
  },
};

const page = (name, mode) => {
  const t = THEME[mode], s = SCENES[name];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .stage{position:relative;width:${OUT_W}px;height:${s.h}px;overflow:hidden;border-radius:36px;background:${t.bg};
    font-family:"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}
  .stage>*{position:absolute}
  img{display:block;width:100%}
  .win{border-radius:14px;overflow:hidden;background:${t.bar};box-shadow:${t.shadow};outline:1px solid ${t.barLine}}
  .bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid ${t.barLine}}
  .bar i{width:12px;height:12px;border-radius:50%;background:${t.dots[0]}}
  .bar i:nth-child(2){background:${t.dots[1]}}.bar i:nth-child(3){background:${t.dots[2]}}
  .bar span{margin:0 auto;transform:translateX(-30px);padding:3px 18px;border-radius:7px;background:${t.url};color:${t.barText};font-size:12px}
  /* iPhone: Maße relativ zur Breite (393 pt), damit jede Größe stimmt. */
  .phone{box-sizing:border-box;border-radius:16.5% / 7.7%;background:${t.frame};box-shadow:${t.shadow},
    inset 0 0 0 1.5px rgba(255,255,255,.16),inset 0 0 0 3px rgba(0,0,0,.5)}
  .phone .scr{position:relative;aspect-ratio:393/852;overflow:hidden;border-radius:14.6% / 6.7%;background:#000;container-type:inline-size}
  .phone .blur{position:absolute;inset:-6%;width:112%;height:112%;object-fit:cover;filter:blur(14px) brightness(.9)}
  .phone .main{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}
  .phone .island{position:absolute;left:50%;top:2.9cqw;width:32cqw;height:9.4cqw;margin-left:-16cqw;border-radius:5cqw;background:#000}
  .phone .sb{position:absolute;left:0;right:0;top:0;height:14.5cqw;display:flex;align-items:center;justify-content:space-between;
    padding:0 8.5cqw 0 12cqw;box-sizing:border-box;color:#fff;font-weight:600;font-size:4.3cqw;letter-spacing:-.01em}
  .phone .sbi{width:17cqw;fill:currentColor}
  .phone .hi{position:absolute;left:50%;bottom:2cqw;width:34cqw;margin-left:-17cqw;height:1.3cqw;border-radius:1cqw;background:rgba(255,255,255,.85)}
  /* iPad: gleichmäßiger schmaler Rand, Frontkamera mittig oben (lange Seite, quer). */
  .tablet{box-sizing:border-box;border-radius:4.4% / 6.2%;background:${t.frame};box-shadow:${t.shadow},
    inset 0 0 0 1.5px rgba(255,255,255,.14),inset 0 0 0 3px rgba(0,0,0,.5)}
  .card{overflow:hidden;border-radius:30px;box-shadow:${t.shadow}}
  .card img{max-width:none}
  .tablet img{border-radius:2.6% / 3.7%}
  .tablet .cam{position:absolute;left:50%;width:.9%;aspect-ratio:1;margin-left:-.45%;transform:translateY(-50%);border-radius:50%;
    background:radial-gradient(circle at 35% 35%,#2b3a4d,#0b0f14 60%)}
  </style></head><body><div class="stage">${s.html(mode)}</div></body></html>`;
};

// ── Rendern ──────────────────────────────────────────────────────────────────
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: OUT_W, height: 1200 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const conv = await b.newPage();

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
for (const name of names) {
  if (!SCENES[name]) { console.error(`Unbekanntes Bild: ${name} (${Object.keys(SCENES).join(', ')})`); process.exitCode = 1; continue; }
  for (const mode of MODES) {
    await p.setContent(page(name, mode), { waitUntil: 'load' });
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const png = await p.locator('.stage').screenshot({ omitBackground: true });
    let q = 0.9, out = await toWebp(png, q);
    while (out.length > MAX_KB * 1024 && q > 0.5) { q -= 0.06; out = await toWebp(png, q); }
    const file = path.join(DIR, `readme-${name}-${mode}.webp`);
    fs.writeFileSync(file, out);
    console.log(`${path.relative(REPO, file)}  ${Math.round(out.length / 1024)} KB  (q ${q.toFixed(2)})`);
  }
}
await b.close();
