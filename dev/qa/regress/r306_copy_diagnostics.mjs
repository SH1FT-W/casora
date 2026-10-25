// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel-diagnostics.js custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-b-mehr.js
// Issue #25 was only solved once the reporter ran a console line (9 trackers, all diagnostic, Studio list 0).
// Studio → ⋯ → Help → "Copy diagnostics…": the dialog shows the text, "Copy" puts exactly that text on the
// clipboard (Clipboard API and the fallback without it, as on plain HTTP), the button then says "Copied".
// The text has the test house's tracker counts and the Studio's own list count, and none of the house's names
// (entity ids, friendly names, devices, areas, people, zones, location, hosts). Nothing is saved.
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard in the test house', !!dash);
const { page, context } = await open({ width: 1440, height: 1000 });
await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await studio(page, dash);

const H = (fn, arg) => page.evaluate(fn, arg);
const menuText = () => H(() => window.__pierce('.combo-menu .combo-opt').map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
// Menu entries react to mousedown, like a tap.
const pick = (re) => H((src) => {
  const it = window.__pierce('.combo-menu .combo-opt').find((x) => new RegExp(src).test(x.textContent));
  if (!it) return false;
  it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  return true;
}, re.source);

// ── Help menu: entry right after "Report a problem" ─────────────────────────
await H(() => window.__panel()._helpMenu(window.__panel().$('more')));
await page.waitForFunction(() => window.__pierce('.combo-menu .combo-opt').length > 2, null, { timeout: 10000 }).catch(() => {});
const items = await menuText();
const at = items.findIndex((x) => /Diagnose kopieren …/.test(x));
await check('Help: "Diagnose kopieren …"', at >= 0, items);
await check('right after "Problem melden"', at > 0 && /Problem melden/.test(items[at - 1]), items);
await check('tapping it works', await pick(/Diagnose kopieren/));

// ── Dialog with the text ────────────────────────────────────────────────────
await page.waitForFunction(() => {
  const b = window.__pierce('.askcard.casora-diag')[0];
  const ta = b && b.querySelector('textarea');
  return !!(ta && ta.value.length > 200);
}, null, { timeout: 20000 }).catch(() => {});
const dlg = await H(() => {
  const b = window.__pierce('.askcard.casora-diag')[0];
  if (!b) return null;
  const btn = [...b.querySelectorAll('.askacts button')].map((x) => x.textContent.trim());
  const ta = b.querySelector('textarea');
  return { title: (b.querySelector('h3') || {}).textContent, btn, text: ta ? ta.value : '', ro: !!(ta && ta.readOnly) };
});
await need('diagnostics dialog', !!dlg && dlg.text.length > 200, dlg);
await check('dialog title "Diagnose"', dlg.title === 'Diagnose', dlg.title);
await check('buttons Schließen · Problem melden · Kopieren', dlg.btn.join(' · ') === 'Schließen · Problem melden · Kopieren', dlg.btn);
await check('text is read-only', dlg.ro);
const text = dlg.text;

// ── Content: the test house's counts, as the Studio sees them ───────────────
const want = await H(() => {
  const p = window.__panel(), h = p._hass, R = h.entities || {};
  const tr = Object.keys(h.states).filter((e) => e.startsWith('device_tracker.'));
  return {
    trackers: tr.length,
    diag: tr.filter((e) => (R[e] || {}).entity_category === 'diagnostic').length,
    lists: p._rankedEntityList(['device_tracker'], undefined, null, '').length,
    lights: Object.keys(h.states).filter((e) => e.startsWith('light.')).length,
    ha: h.config.version,
  };
});
const row = (d) => (text.split('\n').find((l) => l.startsWith(d + ' ')) || '').trim().split(/\s+/);
const tracker = row('device_tracker');
await need('tracker in the test house', want.trackers > 0, want);
await check('code block with header "Casora-Diagnose"', /^```text\nCasora-Diagnose · \d{4}-\d{2}-\d{2}\n/.test(text) && text.endsWith('\n```\n'), text.slice(0, 80));
await check('versions', text.includes('Home Assistant ' + want.ha) && /\nCasora \d+\.\d+\.\d+(?:b\d+)? /.test(text), text.split('\n')[2]);
await check('device_tracker: all and diag as in HA (diagnostic since HA 2026.10)', tracker[1] === String(want.trackers) && tracker[2] === String(want.diag),
  { row: tracker, want });
await check('device_tracker: lists = the Studio entity list', tracker[8] === String(want.lists), { row: tracker, want });
await check('light: all as in HA', row('light')[1] === String(want.lights), row('light'));
await check('pet tile finds the test dog tracker', /\ncasora_pet +1\n/.test(text), text.match(/\ncasora_pet[^\n]*/));
await check('test house integration counted', /\ncasora_mock +\d+  /.test(text));

// ── Nothing private ─────────────────────────────────────────────────────────
const priv = await H(() => {
  const h = window.__panel()._hass, out = new Set();
  const add = (x) => { if (typeof x === 'string' && x.trim()) out.add(x.trim()); };
  Object.values(h.states).forEach((s) => { add(s.entity_id); add(s.entity_id.split('.')[1]); add((s.attributes || {}).friendly_name); });
  Object.values(h.devices || {}).forEach((d) => { add(d.name); add(d.name_by_user); add(d.serial_number); add(d.model); });
  Object.values(h.areas || {}).forEach((a) => { add(a.name); add(a.area_id); });
  Object.values(h.entities || {}).forEach((e) => add(e.name));
  add(h.config.location_name); add(h.user && h.user.name);
  [h.config.internal_url, h.config.external_url, location.origin].forEach((u) => { if (u) { add(u); try { add(new URL(u).host); } catch (e) { /* skip */ } } });
  // Words the text itself is made of (domains, integration and tile type ids, fixed words) are not private.
  const D = window.casoraDiagnostics;
  const vocab = new Set(['casora', 'diagnose', 'home', 'assistant', 'language', 'theme', 'dark', 'light', 'studio', 'new', 'previous',
    'desktop', 'tablet', 'phone', 'browser', 'companion', 'app', 'chrome', 'safari', 'firefox', 'edge', 'on', 'macos', 'linux', 'windows',
    'ios', 'android', 'dashboards', 'layout', 'this', 'one', 'rooms', 'tiles', 'without', 'device', 'community', 'cards', 'added', 'none',
    'entities', 'disabled', 'hidden', 'no', 'state', 'lists', 'usable', 'for', 'tile', 'suggestions', 'entity', 'domain', 'all', 'diag',
    'config', 'no_area', 'no_state', 'type', 'found', 'room', 'integrations', 'knows', 'integration', 'domains', 'other', 'nebel', 'text']
    .concat(D.KNOWN_PLATFORMS, (window.CASORA_TILE_TYPES || []).map((t) => t.id),
      [...new Set(Object.keys(h.states).map((e) => e.split('.')[0]))]));
  const generic = (n) => String(n).toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean).every((w) => vocab.has(w) || /^\d+$/.test(w));
  return [...out].filter((n) => n.length >= 4 && !generic(n));
});
await need('names from the test house to look for', priv.length > 50, priv.length);
// As a whole word: "Dishwasher" (a model) is not a leak inside the tile type id "casora_dishwasher".
const lower = text.toLowerCase();
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const leaked = priv.filter((n) => new RegExp('(^|[^a-z0-9_])' + esc(n.toLowerCase()) + '($|[^a-z0-9_])').test(lower));
await check('no names, ids, areas or hosts of the test house in the text', leaked.length === 0, leaked.slice(0, 10));
await check('only plain characters (no URL, address, emoji)', /^[A-Za-z0-9 _.,:()=+·–\-\n`]+$/.test(text) && !/https?:|@/.test(text));

// ── Copy: Clipboard API (localhost is a secure context) ─────────────────────
const copyBtn = () => H(() => [...window.__pierce('.askcard.casora-diag .askacts button')].pop().click());
const btnText = () => H(() => [...window.__pierce('.askcard.casora-diag .askacts button')].pop().textContent.trim());
const clip = () => page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
await page.evaluate(() => navigator.clipboard.writeText('-')).catch(() => {});
await copyBtn();
await page.waitForFunction(() => /Kopiert/.test([...window.__pierce('.askcard.casora-diag .askacts button')].pop().textContent), null, { timeout: 5000 }).catch(() => {});
await check('button says "Kopiert"', /^Kopiert$/.test(await btnText()), await btnText());
await check('clipboard holds exactly the shown text', (await clip()) === text);
await check('dialog stays open after copying', await H(() => !!window.__pierce('.askcard.casora-diag')[0]));

// ── Copy without the Clipboard API (plain HTTP, Companion app on HTTP) ──────
await page.evaluate(() => navigator.clipboard.writeText('-')).catch(() => {});
const saved = await H(() => {
  window.__diagClip = navigator.clipboard;
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  return navigator.clipboard === undefined;
});
await need('Clipboard API switched off for the fallback', saved);
await copyBtn();
await page.waitForTimeout(400);
await H(() => {
  Object.defineProperty(navigator, 'clipboard', { value: window.__diagClip, configurable: true });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});
await check('fallback copies the same text', (await clip()) === text);
await check('no "copy by hand" warning', await H(() => !window.__pierce('.askcard.casora-diag .casora-diag-warn')[0]));

// ── Close ───────────────────────────────────────────────────────────────────
await H(() => window.__pierce('.askcard.casora-diag .askacts button')[0].click());
await page.waitForFunction(() => !window.__pierce('.askcard.casora-diag')[0], null, { timeout: 5000 }).catch(() => {});
await check('"Schließen" closes the dialog', await H(() => !window.__pierce('.askcard.casora-diag')[0]));

// ── Studio search finds it ──────────────────────────────────────────────────
const found = await H(() => {
  const p = window.__panel();
  if (typeof p._mSearchItems !== 'function') return null;
  return p._mSearchItems().filter((x) => x.id === 'a:diag').map((x) => x.label);
});
if (found !== null) await check('Studio search: "Diagnose kopieren …"', found.length === 1 && found[0] === 'Diagnose kopieren …', found);
await finish();
