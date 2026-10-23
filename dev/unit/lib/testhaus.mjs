// Shared by unit tests that check the Studio against the test house (dev/casora_mock), without Home Assistant.
//   testhaus()    – the test house as the frontend sees it (hass.states/entities/devices/areas), built by
//                   dev/casora_mock/haus.py: the made-up devices, plus the private fixture where it exists (gate)
//   loadPanel()   – the real Studio panel class with its modules (types, assistant, basis, device list)
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const noop = () => {};

export function testhaus({ publicOnly = false } = {}) {
  const py = process.env.CASORA_PYTHON || 'python3';
  const r = spawnSync(py, [ROOT + 'dev/casora_mock/haus.py'].concat(publicOnly ? ['--public'] : []),
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('haus.py failed: ' + (r.stderr || r.error));
  const snap = JSON.parse(r.stdout);
  return Object.assign(snap, { language: 'de', locale: { language: 'de' }, config: {}, themes: {}, user: { is_admin: true } });
}

let loaded = null;
export async function loadPanel() {
  if (loaded) return loaded;
  let Panel = null;
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
  globalThis.window = globalThis;
  globalThis.location = { pathname: '/' };
  globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
  globalThis.addEventListener = noop;
  globalThis.removeEventListener = noop;
  globalThis.setTimeout = () => 0;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  globalThis.HTMLElement = class {};
  globalThis.innerWidth = 1400;
  globalThis.innerHeight = 900;
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
  globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
  const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"').replace(/\bimport\((["'])/g, 'Promise.reject($1');
  const info = console.info;
  console.info = noop;
  globalThis.document = stub();
  new Function(fix(read('custom_components/casora/scripts/local/00-finder.js')))();
  new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
  new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
  if (!Panel) throw new Error('panel class not defined');
  // The modules extend the panel once it is defined.
  globalThis.customElements.whenDefined = () => Promise.resolve();
  for (const m of ['assist', 'basis', 'b-ux']) new Function(fix(read(`custom_components/casora/panel/casora-panel-${m}.js`)))();
  await new Promise((r) => setImmediate(r));
  console.info = info;
  globalThis.document = { createElement: () => ({ style: {}, dataset: {}, children: [], appendChild: (c) => c, setAttribute: noop, addEventListener: noop }),
    querySelector: () => null, addEventListener: noop, removeEventListener: noop };
  loaded = { Panel, P: Panel.prototype, I: window.__casoraPanelInternals };
  return loaded;
}
