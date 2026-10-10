#!/usr/bin/env node
// Randfälle fürs Dashboard (1.3 „Fehlerfrei“): alle Entitäten der sichtbaren Kacheln nur im Browser
// verbiegen und dabei Konsole/Seitenfehler sammeln – nicht verfügbar, unbekannt, ohne Attribute,
// leere Listen (alle Listen-Attribute = []), sehr lange Namen, Entität fehlt, Entität verschwindet
// während ihr Popup offen ist. Nichts wird in HA gespeichert (Zustände nur im Browser, wie fakeStates).
//
//   CASORA_URL=… CASORA_TOKENS=… node dev/qa/randfaelle.mjs [--dash qa-arbeit] [--views 4] [--popups 6]
//        [--viewports desktop,handy]
// Mit CASORA_KONSOLE (dev/qa/konsole.mjs --randfaelle) landet jede Meldung mit Lauf „<lauf>/rand:<fall>“
// im Mitschnitt. Ausgabe: Zeile je Fall mit Zahl neuer Fehler; Exit 1 bei Fehlern.
import fs from 'node:fs';
import path from 'node:path';

process.env.CASORA_OUT = process.env.CASORA_OUT || '/tmp/casora-qa';
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
const { open, ready, PIERCE } = await import('../e2e/harness.mjs');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DASH = opt('dash', 'qa-arbeit');
const VIEWS = Number(opt('views', 4));
const POPUPS = Number(opt('popups', 6));
const VPS = { desktop: { width: 1440, height: 900 }, handy: { width: 393, height: 852, mobile: true, safari: true } };
const LAUF = process.env.CASORA_KONSOLE_LAUF || 'rand';

const LANG = 'Ein wirklich sehr langer Gerätename, der in keine Kachel und kein Popup passt – Wohnzimmer Ost';
const FAELLE = {
  nicht_verfuegbar: (s) => ({ state: 'unavailable', attributes: s.attributes }),
  unbekannt: (s) => ({ state: 'unknown', attributes: s.attributes }),
  ohne_attribute: (s) => ({ state: s.state, attributes: {} }),
  leere_listen: (s) => ({ state: s.state, attributes: Object.fromEntries(Object.entries(s.attributes || {}).map(([k, v]) => [k, Array.isArray(v) ? [] : v])) }),
  lange_namen: (s) => ({ state: s.state, attributes: { ...s.attributes, friendly_name: LANG } }),
  fehlt: () => null,
};

// Zustände ersetzen (nicht nur mischen wie fakeStates) und gegen echte Updates festhalten.
async function patch(page, fall, ids) {
  await page.evaluate(([fall, ids, src, lang]) => {
    const mk = new Function('LANG', 'return ' + src)(lang);
    const ha = document.querySelector('home-assistant');
    const apply = (st) => {
      const out = { ...st };
      for (const id of ids) {
        if (!st[id]) continue;
        const v = mk[fall](st[id]);
        if (v === null) delete out[id];
        else out[id] = { ...st[id], state: v.state, attributes: v.attributes };
      }
      return out;
    };
    const orig = ha.__randOrig || ha._updateHass;
    ha.__randOrig = orig;
    ha._updateHass = function (obj) { return orig.call(this, obj && obj.states ? { ...obj, states: apply(obj.states) } : obj); };
    ha._updateHass({ states: ha.hass.states });
  }, [fall, ids, '{' + Object.entries(FAELLE).map(([k, f]) => JSON.stringify(k) + ':' + f.toString()).join(',') + '}', LANG]);
}

const entityIds = (page) => page.evaluate(() => {
  const ids = new Set();
  const S = document.querySelector('home-assistant').hass.states;
  for (const c of window.__pierce('button-card')) {
    const cfg = c._config || {};
    if (typeof cfg.entity === 'string' && S[cfg.entity]) ids.add(cfg.entity);
    const vars = cfg.variables || {};
    for (const v of Object.values(vars)) {
      if (typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v) && S[v]) ids.add(v);
      if (Array.isArray(v)) v.forEach((x) => { if (typeof x === 'string' && S[x]) ids.add(x); });
    }
  }
  return [...ids];
});

const tiles = (page) => page.evaluate(() => window.__pierce('button-card').filter((c) => {
  const t = JSON.stringify((c._config || {}).template || '');
  if (/badge|casora_room\b|hero|nav|scene_row|filter/.test(t)) return false;
  const card = c.shadowRoot && c.shadowRoot.querySelector('ha-card');
  if (!card) return false;
  const r = card.getBoundingClientRect();
  return r.width >= 60 && r.height >= 50 && r.width < innerWidth * 0.9 && r.top < innerHeight * 3;
}).map((c, i) => { c.setAttribute('data-rand', String(i)); return { i, entity: (c._config || {}).entity || '' }; }));

const popupEntity = (page) => page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((e) => e.hasAttribute('open'));
  const more = window.__pierce('ha-more-info-dialog')[0];
  return p ? 'casora' : (more && more.shadowRoot && more.shadowRoot.querySelector('ha-dialog[open], ha-adaptive-dialog, ha-wa-dialog') ? 'more-info' : '');
});

// Sichtbarer Text mit „undefined“, „NaN“, „[object Object]“, „Infinity“ (Shadow-DOM eingeschlossen).
const kaputt = (page) => page.evaluate(() => {
  const out = [];
  const RE = /\bundefined\b|\bNaN\b|\[object Object\]|\bInfinity\b|\bnull\s*(%|°|W\b|kWh)/;
  const walk = (root) => {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!RE.test(n.data)) continue;
      const el = n.parentElement; if (!el || el.closest('style,script')) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      out.push(n.data.trim().slice(0, 80));
    }
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
  };
  walk(document);
  return [...new Set(out)].slice(0, 5);
}).catch(() => []);

async function closeAll(page) {
  for (let i = 0; i < 3; i++) {
    const n = await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* zu */ } return window.__pierce('casora-popup').filter((e) => e.hasAttribute('open')).length; }).catch(() => 0);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(350);
    if (!n) return;
  }
}

async function tapTile(page, i) {
  const h = await page.evaluateHandle((i) => {
    const c = window.__pierce('button-card').find((e) => e.getAttribute('data-rand') === String(i));
    return c && c.shadowRoot && c.shadowRoot.querySelector('ha-card');
  }, i);
  const el = h.asElement();
  if (!el) return false;
  await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  await el.click({ timeout: 3000 }).catch(() => {});
  if (page.isClosed()) return false;
  await page.waitForTimeout(1200).catch(() => {});
  return !page.isClosed();
}

const ergebnis = [];
for (const vp of opt('viewports', 'desktop,handy').split(',')) {
  const s = await open(VPS[vp]);
  const { page, errors } = s;
  // Schreibende Dienstaufrufe aus Kachel-Taps blocken (nur Zustände im Browser).
  await s.context.addInitScript(() => {
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      send(d) {
        if (typeof d === 'string' && /"type":"call_service"/.test(d)) {
          try { const m = JSON.parse(d); setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: m.id, type: 'result', success: true, result: { context: { id: 'rand' } } }) })), 0); return; } catch (e) { /* senden */ }
        }
        return super.send(d);
      }
    };
  });
  const dash = vp === 'handy' ? DASH + '-mobile' : DASH;
  await ready(page, '/' + dash + '/0', () => window.__pierce && window.__pierce('button-card').length > 3, 90000).catch(() => {});
  const views = await page.evaluate(async (d) => {
    const c = await document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/config', url_path: d });
    return (c.views || []).map((v, i) => v.path || String(i));
  }, dash).catch(() => ['0']);
  for (const v of views.slice(0, VIEWS)) {
    for (const fall of Object.keys(FAELLE)) {
      process.env.CASORA_KONSOLE_LAUF = `${LAUF}/rand:${fall}`;
      const e0 = errors.length;
      await ready(page, `/${dash}/${v}`, () => window.__pierce && window.__pierce('button-card').length > 3, 60000).catch(() => {});
      await page.addScriptTag({ content: PIERCE });
      const ids = await entityIds(page);
      await patch(page, fall, ids);
      await page.waitForTimeout(1500);
      const texte = new Set(await kaputt(page));
      const ts = (await tiles(page)).slice(0, POPUPS);
      for (const t of ts) {
        if (process.env.RAND_DEBUG) console.log('  tippe', t.i, t.entity);
        if (!(await tapTile(page, t.i))) { if (page.isClosed()) throw new Error('Seite geschlossen nach Kachel ' + t.i + ' ' + t.entity); continue; }
        const pop = await popupEntity(page);
        if (pop) (await kaputt(page)).forEach((x) => texte.add(`Popup ${t.entity}: ${x}`));
        // Gerät gelöscht, während das Popup offen ist (nur im Fall „nicht_verfuegbar“: einmal reicht).
        if (pop && fall === 'nicht_verfuegbar' && t.entity) {
          process.env.CASORA_KONSOLE_LAUF = `${LAUF}/rand:geloescht_bei_offenem_popup`;
          await patch(page, 'fehlt', [t.entity]);
          await page.waitForTimeout(1200);
          process.env.CASORA_KONSOLE_LAUF = `${LAUF}/rand:${fall}`;
        }
        await closeAll(page);
      }
      if (errors.pending && errors.pending.size) await Promise.race([Promise.all([...errors.pending]), new Promise((r) => setTimeout(r, 1500))]);
      const neu = errors.slice(e0);
      ergebnis.push({ vp, view: v, fall, entitaeten: ids.length, kacheln: ts.length, fehler: neu.length, texte: [...texte] });
      console.log(`${neu.length ? '✗' : '✓'} [${vp}] ${dash}/${v} ${fall}: ${ids.length} Entitäten, ${ts.length} Kacheln, ${neu.length} Fehler${neu.length ? ' – ' + neu.slice(0, 3).map((x) => x.slice(0, 160)).join(' | ') : ''}${texte.size ? ' · Text kaputt: ' + [...texte].join(' | ') : ''}`);
    }
  }
  await s.browser.close();
}
process.env.CASORA_KONSOLE_LAUF = LAUF;
const n = ergebnis.reduce((a, r) => a + r.fehler, 0);
const nt = ergebnis.reduce((a, r) => a + r.texte.length, 0);
console.log(`Randfälle: ${ergebnis.length} Fälle, ${n} Konsolenfehler, ${nt} kaputte Texte`);
if (process.env.CASORA_KONSOLE) fs.writeFileSync(path.join(path.dirname(process.env.CASORA_KONSOLE), 'randfaelle.json'), JSON.stringify(ergebnis, null, 1));
process.exit(n ? 1 : 0);
