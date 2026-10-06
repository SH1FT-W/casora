// @zustand: arbeit
// @parallel: ui
// Neues Studio (B, ab 1.1.0-beta.1): Update-Hinweis und Umschalter. Erwartet: Nach dem Update von
// einer älteren Version zeigt „Neu in Casora“ die volle Version (1.1.0-beta.1, nicht
// „1.1.0-beta“) mit ihren Neuerungen; das Studio nennt dieselbe Version. Wer über
// „…“ › Hilfe › „Bisheriges Studio öffnen“ zum bisherigen Studio wechselt, behält das nach neuem Laden (pro Browser).
// Es wird nichts gespeichert.
import fs from 'node:fs';
import { open, studio, casoraDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const version = JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/manifest.json', import.meta.url), 'utf8')).version;

// Update von 1.0.4: gesehene Version vor dem Laden zurücksetzen (nur beim ersten Laden).
const o = await open({ width: 1440, height: 900, dark: false });
usePage(o.page);
await o.context.addInitScript(() => {
  if (!sessionStorage.getItem('qa.r38')) { sessionStorage.setItem('qa.r38', '1'); localStorage.setItem('casora.seenVersion', '1.0.4'); }
});
await studio(o.page, dash.url);
const H = (fn, a) => o.page.evaluate(fn, a);
const pop = await o.page.waitForFunction(() => { const h = window.__pierce('#cw-t')[0]; return h && h.getClientRects().length ? h.textContent.trim() : null; },
  null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
await check('„Neu in Casora“ erscheint nach dem Update', !!pop, pop);
await check('Titel nennt die volle Version ' + version, !!pop && pop.includes(version) && !new RegExp(version.replace(/[.]/g, '\\.') + '\\.').test(pop), pop);
const items = await H(() => window.casoraWhatsNew && window.casoraWhatsNew('de'));
// Nicht vom Inhalt des Release-Eintrags abhängen (wechselt mit jedem Release): nur gleiche Version
// und mindestens eine Neuerung mit Titel und Text.
await check('Neuerungen zur gleichen Version', !!items && items.version === version && Array.isArray(items.items)
  && items.items.length > 0 && items.items.every((x) => x && x[0] && x[1]), items);
await o.page.keyboard.press('Escape');
await o.page.waitForTimeout(800);
const ver = await H(() => { const v = window.__panel().shadowRoot.querySelector('.ver'); return v ? v.textContent.trim() : null; });
await check('Studio nennt v' + version, ver === 'v' + version, ver);

// Umschalten zum bisherigen Studio, neu laden
await H(() => { const p = window.__panel(); if (p._bClose) p._bClose(); });
await o.page.locator('#more').click();
await o.page.waitForTimeout(500);
await o.page.locator('.combo-opt', { hasText: /^\s*(Hilfe|Help)/ }).first().click();
await o.page.waitForTimeout(600);
await o.page.locator('.combo-opt', { hasText: /Bisheriges Studio|previous Studio/ }).first().click();
await o.page.waitForTimeout(1500);
await o.page.reload();
await studio(o.page, dash.url);
const a = await H(() => ({ b: window.__panel().classList.contains('bmode'), key: localStorage.getItem('casora.studio.b') }));
await check('Bisheriges Studio bleibt nach neuem Laden', !a.b && a.key === '0', a);
await finish();
