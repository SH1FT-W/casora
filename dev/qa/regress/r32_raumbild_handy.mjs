// @zustand: arbeit
// Gemeldet (04.10.2026): „Raumbilder auf mobile sind nicht die wie in der UI eingestellt
// oder nach dem Import.“ Am Handy stand auf der Startseite immer das Theme-Bild (home-demo), egal
// welches Foto im Studio für die Übersicht gewählt oder beim Umzug übernommen war.
// Erwartet: (1) Der Studio-Abgleich schreibt das Foto der Übersicht an casora_mobile_bg
// (image/image_night), (2) das Handy-Dashboard zeichnet dieses Foto statt des Theme-Bilds,
// (3) ohne image nimmt es das erste Foto der Vorlade-Liste (ältere Handy-Layouts nach dem Umzug).
// Es wird nichts gespeichert: Studio nur im Speicher, am Handy nur die Karte im Browser umgestellt.
import { open, studio, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

// ── (1) Studio: Foto der Übersicht → Handy-Layout ────────────────────────────
const s = await open();
await studio(s.page, dash.url);
const sync = await s.page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const pair = p._pair;
  if (!pair || pair.safe === false) return { pair: false };
  const rooms = pair.desktop.compact.rooms;
  const home = rooms.find((r) => I.isHomeRoom(r, rooms)) || rooms[0];
  const pick = ['garden-demo', 'pool-demo', 'balcony-demo'].find((n) => n !== home.variables.image);
  home.variables.image = pick;
  I.syncPairRooms(pair);
  const cfg = I.expandMobileConfig(pair.mobile.compact, pair.mobile.scaffold, pair.mobile.extras, pair.mobile.templates, pair.mobile.chrome);
  const bg = (cfg.views[0].cards || []).find((c) => c && c.template === 'casora_mobile_bg');
  return { pair: true, pick, bg: bg ? (bg.variables || {}) : null };
});
await need('Handy-Dashboard gekoppelt', sync.pair);
await check('Handy-Hintergrund (casora_mobile_bg) vorhanden', !!sync.bg, sync);
await check('Studio schreibt das Foto der Übersicht ans Handy', sync.bg && sync.bg.image === sync.pick, sync);

// ── (2)/(3) Handy-Dashboard zeichnet das Foto ────────────────────────────────
const m = await open({ width: 390, height: 844, mobile: true, dark: false });
await dashboard(m.page, dash.phone.url, 3);
const drawn = (vars) => m.page.evaluate(async (vars) => {
  const el = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_bg'));
  if (!el) return { err: 'keine casora_mobile_bg-Karte' };
  const cfg = JSON.parse(JSON.stringify(el._config));
  delete cfg.variables.image; delete cfg.variables.image_night;
  cfg.variables = { ...cfg.variables, ...vars };
  el.setConfig(cfg);
  el.hass = document.querySelector('home-assistant').hass;
  await new Promise((r) => setTimeout(r, 1500));
  const img = getComputedStyle(document.documentElement).getPropertyValue('--casora-mobile-hero-img-day');
  const bg = getComputedStyle(document.documentElement).backgroundImage;
  return { img: img.trim(), bg: bg.slice(-120) };
}, vars);
const a = await drawn({ image: 'pool-demo' });
await check('Handy zeichnet image (pool-demo) statt des Theme-Bilds', /pool-demo\.jpg/.test(a.bg || '') && /pool-demo\.jpg/.test(a.img || ''), a);
const b = await drawn({ preload_rooms: ['balcony-demo', 'kitchen-demo'] });
await check('ohne image: erstes Foto der Vorlade-Liste (Übersicht)', /balcony-demo\.jpg/.test(b.bg || ''), b);
await finish();
