// "Your Dashboard Is Ready" (Prüfrunde u01-12): the row "Use as Default Dashboard" came last, under the live preview,
// and the fixed buttons cut it in half at 1440x1000. It now stands above the preview. Runs _flowDone with a small
// stand-in DOM and checks the order of the screen's parts.
//   node dev/unit/fertig_standard_dashboard.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_flowDone
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('  _flowDone(opts) {');
assert.ok(a > 0, '_flowDone');
const method = src.slice(a, src.indexOf('\n  }\n', a) + 4).replace('_flowDone(opts) {', 'function _flowDone(opts) {');

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.parentNode = null; this.className = ''; this.style = { setProperty() {} };
    this.classList = { add: (c) => { this.className += ' ' + c; } }; this.dataset = {}; this.attrs = {}; }
  appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this;
    const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
  set innerHTML(v) { this._html = v; } set textContent(v) { this._text = v; }
}
const document = { createElement: (t) => new El(t) };
const fn = new Function('document', 'setupClear', 'mobilePathOf', 'FLOW_GLYPH', 'FLOW_TINT', 'CASORA_THEMES', 'iconUrl', 'roomGlyph',
  method + '\nreturn _flowDone;')(document, () => {}, (p) => p + '-mobile', {}, {}, [{ label: 'x' }], () => '', () => '');

const body = new El('div');
const self = {
  _hass: { user: { is_admin: true }, callWS: async () => ({}) },
  _flowScreen: () => ({ box: new El('div'), body, acts: new El('div') }),
  _livePreview() {},
  _flowGroup(parent, o) { const g = new El('div'); g.className = 'fgroup'; g.footer = o && o.footer; const l = new El('div'); g.appendChild(l); parent.appendChild(g); return l; },
  _flowRow(list, o) { const row = new El('div'); row.title = o.title; list.appendChild(row); return { row }; },
  _flowButton() {}, _flowLeave() {}, _log() {},
};
fn.call(self, { url_path: 'casora-x', title: 'Casora', rooms: [{ path: 'home' }], paired: true });
const order = body.children.map((c) => (c.className.includes('dn-stage') ? 'preview'
  : c.footer && /Opens first/.test(c.footer) ? 'default' : c.className.trim()));
assert.ok(order.indexOf('default') > -1, 'default dashboard row shown: ' + order);
assert.ok(order.indexOf('default') < order.indexOf('preview'), 'default dashboard row above the preview: ' + order.join(', '));
console.log('ok fertig_standard_dashboard');
