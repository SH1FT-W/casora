// Baut die Kamerabilder der Testhaus-Kameras neu: szenen.js (SVG) → Canvas → Nachbearbeitung je Stimmung →
// dev/casora_mock/bilder/<stimmung>/<bild>.jpg und rahmen.json (Erkennungsrahmen nach der Verzerrung, in Pixeln).
//   tag        Kameralook: Weitwinkel-Wölbung, Farbsaum, Körnung, Vignette
//   daemmerung Abendlicht: weich, leichte Vignette, ohne Kamera-Verzerrung
//   nacht      Nachtsicht (IR): Graustufen, Ferne dunkel, Hotspot des IR-Strahlers, Körnung
// Nur bei geänderten Szenen nötig:  node dev/kamerabilder/render.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function findPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) return process.env.PLAYWRIGHT_PATH;
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(f)) return f;
  }
  return 'playwright';
}
const { chromium } = await import(findPlaywright());
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, '..', 'casora_mock', 'bilder');

// Bilder je Szene (Objekte) und Erkennungsrahmen vor der Verzerrung [x0, y0, x1, y1].
const BILDER = [
  ['hof', 'hof', {}], ['hof', 'hof_person', { person: true }], ['hof', 'hof_cat', { cat: true }],
  ['tuer', 'tuer', {}], ['tuer', 'tuer_person', { person: true }],
];
const RAHMEN = {
  hof: { car: [626, 306, 874, 556], person: [552, 280, 618, 460], cat: [918, 538, 1012, 598] },
  tuer: { person: [566, 284, 714, 700] },
};
const K = { hof: .16, tuer: .2 };   // Wölbung (tag, nacht)

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ path: path.join(HERE, 'szenen.js') });
await page.addScriptTag({ content: `
window.renderIt = async function (scene, mood, objs, k) {
  const svg = (scene === 'hof' ? hof : tuer)(PAL[mood], objs);
  const W = 1280, H = scene === 'hof' ? 720 : 960;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  let s0 = 12345;
  const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  if (mood === 'daemmerung') {
    const src = x.getImageData(0, 0, W, H), d = src.data;
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      const p = (y * W + i) * 4, nx = (i / W - .5) * 2, ny = (y / H - .5) * 2;
      const v = 1 - .18 * Math.pow(Math.min(1, (nx * nx + ny * ny) / 2), 1.2);
      d[p] *= v; d[p + 1] *= v; d[p + 2] *= v;
    }
    x.putImageData(src, 0, 0);
    return c.toDataURL('image/jpeg', .8);
  }
  const night = mood === 'nacht';
  const b = document.createElement('canvas'); b.width = W; b.height = H;
  const bx = b.getContext('2d');
  bx.filter = night ? 'blur(1.1px)' : 'blur(.6px) saturate(.88) contrast(1.06) brightness(1.03)';
  bx.drawImage(c, 0, 0);
  const s = bx.getImageData(0, 0, W, H).data, out = x.createImageData(W, H), d = out.data;
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
  const samp = (sx, sy, ch) => {
    sx = Math.min(W - 1.001, Math.max(0, sx)); sy = Math.min(H - 1.001, Math.max(0, sy));
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, p = (y0 * W + x0) * 4 + ch;
    return (s[p] * (1 - fx) + s[p + 4] * fx) * (1 - fy) + (s[p + W * 4] * (1 - fx) + s[p + W * 4 + 4] * fx) * fy;
  };
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    const dx = (i - cx) / R, dy = (y - cy) / R, r2 = dx * dx + dy * dy, p = (y * W + i) * 4;
    // je Farbkanal etwas andere Wölbung = Farbsaum am Rand
    let rgb = [0, 1, 2].map((ch) => { const kk = k * (1 + (ch - 1) * .025); const f = (1 + kk * r2) / (1 + kk); return samp(cx + dx * R * f, cy + dy * R * f, ch); });
    const vig = 1 - (night ? .5 : .3) * Math.pow(r2 / .5, 1.3);
    if (night) {
      const t = Math.min(1, Math.max(0, (y / H - .28) / .55)), near = .5 + .8 * t * t * (3 - 2 * t);
      let l = .3 * rgb[0] + .59 * rgb[1] + .11 * rgb[2];
      l = l * near * (.95 + .25 * (1 - Math.min(1, r2 / .35))) * vig + gauss() * 5;
      rgb = [l * .98, l, l * 1.02];
    } else {
      const n = gauss() * 3;
      rgb = [rgb[0] * vig + n, rgb[1] * vig + n, rgb[2] * vig + n];
    }
    d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return c.toDataURL('image/jpeg', .78);
};` });

// Rahmen durch dieselbe Wölbung schicken: Ziel-Radius r zu Quell-Radius r·(1+k r²)/(1+k) umkehren (Halbierung).
function warp(box, scene, k) {
  if (!k) return box.map(Math.round);
  const W = 1280, H = scene === 'hof' ? 720 : 960, cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
  const pt = (sx, sy) => {
    const ux = (sx - cx) / R, uy = (sy - cy) / R, rs = Math.hypot(ux, uy);
    if (rs < 1e-6) return [sx, sy];
    let lo = 0, hi = 2;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (m * (1 + k * m * m) / (1 + k) < rs) lo = m; else hi = m; }
    const f = lo / rs;
    return [cx + ux * f * R, cy + uy * f * R];
  };
  const [x0, y0, x1, y1] = box, ps = [];
  for (let t = 0; t <= 1.0001; t += .1) ps.push(pt(x0 + (x1 - x0) * t, y0), pt(x0 + (x1 - x0) * t, y1), pt(x0, y0 + (y1 - y0) * t), pt(x1, y0 + (y1 - y0) * t));
  return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))].map(Math.round);
}

const rahmen = {};
for (const mood of ['tag', 'daemmerung', 'nacht']) {
  fs.mkdirSync(path.join(OUT, mood), { recursive: true });
  const k = mood === 'daemmerung' ? 0 : null;
  rahmen[mood] = {};
  for (const [scene, name, objs] of BILDER) {
    const kk = k === 0 ? 0 : K[scene];
    const jpg = await page.evaluate(([sc, m, o, kv]) => window.renderIt(sc, m, o, kv), [scene, mood, objs, kk]);
    const f = path.join(OUT, mood, name + '.jpg');
    fs.writeFileSync(f, Buffer.from(jpg.split(',')[1], 'base64'));
    console.log(mood, name, Math.round(fs.statSync(f).size / 1024) + ' KB');
    if (!rahmen[mood][scene]) rahmen[mood][scene] = Object.fromEntries(Object.entries(RAHMEN[scene]).map(([l, bx]) => [l, warp(bx, scene, kk)]));
  }
}
fs.writeFileSync(path.join(OUT, 'rahmen.json'), JSON.stringify(rahmen, null, 1) + '\n');
await browser.close();
