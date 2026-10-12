// @zustand: arbeit
// @parallel: allein   (speichert das Handy-Dashboard und stellt es am Ende wieder her)
// Gemeldet (11.10.2026): Am Handy saßen Name und Zustand einer großen Kachel 2 bis 4 px tiefer als in der
// kleinen Kachel daneben (beide enden unten bündig). Erwartet: Name oben und Zustand unten fluchten (±1 px).
import { open, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';
const dash = await casoraDashboard();
const c0 = await ws(); const LIGHT = ((await c0.cmd({ type: 'get_states' })).find((x) => /^light\./.test(x.entity_id) && x.state !== 'unavailable') || {}).entity_id;
const orig = await c0.cmd({ type: 'lovelace/config', url_path: dash.phone.url }); c0.close();
atFinish(async () => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: orig }); } finally { c.close(); } });
{ const cfg = JSON.parse(JSON.stringify(orig)); let done = false;
  (function w(o) { if (done || !o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(w);
    if (o.type === 'custom:casora-smart-row' && Array.isArray(o.cards) && o.cards.filter((c) => c && c.type === 'custom:button-card' && [].concat(c.template || []).some((t) => /^casora_/.test(t) && !/^casora_(mobile|badge|room|section)/.test(t))).length >= 3) { const big = { type: 'custom:button-card', template: 'casora_light', entity: LIGHT };
      big.variables = { ...(big.variables || {}), size: 'large' }; o.cards.unshift(big); done = true; return; } Object.values(o).forEach(w); })(cfg);
  await need('große Kachel in die Favoriten gesetzt', done);
  const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: cfg }); } finally { c.close(); } }
const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await dashboard(page, dash.phone.url);
const r = await page.evaluate(() => window.__pierce('button-card').map((b) => {
  const sr = b.shadowRoot, c = sr && sr.querySelector('ha-card'); if (!c) return null;
  const R = c.getBoundingClientRect(); if (R.width < 120 || R.width > 200 || R.top < 150 || R.top > 700) return null;
  const q = (s) => { const e = sr.querySelector(s); if (!e) return null; const x = e.getBoundingClientRect(); return x.height ? [Math.round(x.top - R.top), Math.round(x.bottom - R.top)] : null; };
  const txt = (s) => { const e = sr.querySelector(s); return e ? e.textContent.trim().slice(0, 20) : ''; };
  const fs = (s) => { const e = sr.querySelector(s); return e ? getComputedStyle(e).fontSize + '/' + getComputedStyle(e).lineHeight + '/mb' + getComputedStyle(e).marginBottom : ''; };
  return { f: fs('#name') + ' ' + fs('#state'), name: txt('#name'), x: Math.round(R.left), top: Math.round(R.top), h: Math.round(R.height), nm: q('#name'), lb: q('#label'), st: q('#state'), tpl: [].concat(b._config.template || []).join(',').slice(0, 60) };
}).filter(Boolean));
// Die Nachbarin links oder rechts (die Reihe sortiert aktive Kacheln nach vorn, die große steht mal rechts).
const big = r.find((x) => x.h > 100), next = big && r.find((x) => x.h < 80 && Math.abs(x.x - big.x) > 50 && Math.abs(x.top + x.h - (big.top + big.h)) <= 1);
await need('große Kachel mit kleiner Nachbarin unten bündig', big && next, r);
const off = next.top - big.top;
await check('Name fluchtet (oben)', Math.abs(big.nm[0] - (next.nm[0] + off)) <= 1, { gross: big.nm, klein: next.nm.map((v) => v + off) });
await check('Zustand fluchtet (unten)', Math.abs(big.st[1] - (next.st[1] + off)) <= 1, { gross: big.st, klein: next.st.map((v) => v + off) });
await finish();
