// Report 10/2026: since installing Casora, OK/Save at the bottom of HA's own dialogs is cut off in the
// mobile app. casora-core.js pushed every wa-dialog down by --casora-popup-top (112px), including HA's
// phone layout, where the dialog fills the screen (min-height 100dvh) and so overflows by those 112px.
// Expected: the offset only over a dashboard or the Studio, never in HA's fullscreen layout.
//   node dev/unit/dialog_offset_fullscreen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf("  if (window._casoraDialogChrome) return;");
const b = core.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'dialog chrome block found');
const body = core.slice(a, b);

class El {
  constructor(name, attrs = {}) { this.localName = name; this.attrs = new Map(Object.entries(attrs)); }
  hasAttribute(n) { return this.attrs.has(n); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  toggleAttribute(n, on) { if (on) this.attrs.set(n, ''); else this.attrs.delete(n); return on; }
}

let hass = null;
const opened = [];
function HTMLDialogElement() {}
HTMLDialogElement.prototype.showModal = function () { opened.push(this); };
const env = {
  window: { HTMLDialogElement },
  document: {
    readyState: 'loading',
    addEventListener() {},
    querySelector: (s) => (s === 'home-assistant' ? { hass } : null),
    createElement: () => ({ textContent: '' }),
  },
};
env.window.window = env.window;
new Function('window', 'document', 'HTMLDialogElement', body)(env.window, env.document, HTMLDialogElement);

// A dialog as HA builds it: ha-dialog > (shadow) wa-dialog > (shadow) <dialog>.
function open(panelUrl, haAttrs = {}) {
  hass = { panelUrl, panels: { lovelace: { component_name: 'lovelace' }, 'dashboard-casora': { component_name: 'lovelace' },
    config: { component_name: 'config' }, hacs: { component_name: 'custom' }, 'casora-studio': { component_name: 'custom' } } };
  const ha = new El('ha-dialog', haAttrs);
  const wa = new El('wa-dialog');
  const styles = [];
  wa.shadowRoot = { appendChild: (st) => styles.push(st.textContent) };
  wa.getRootNode = () => ({ host: ha });
  const dlg = Object.create(HTMLDialogElement.prototype);
  dlg.getRootNode = () => ({ host: wa });
  dlg.showModal();
  return { wa, css: styles.join('\n') };
}

const dash = open('dashboard-casora');
assert.ok(dash.wa.hasAttribute('casora-offset'), 'dashboard: offset on');
assert.ok(open('lovelace').wa.hasAttribute('casora-offset'), 'default dashboard: offset on');
assert.ok(open('casora-studio').wa.hasAttribute('casora-offset'), 'Studio: offset on');
assert.ok(!open('config').wa.hasAttribute('casora-offset'), 'settings (repairs, config flows): no offset');
assert.ok(!open('hacs').wa.hasAttribute('casora-offset'), 'HACS: no offset');
assert.ok(!open('dashboard-casora', { fullscreen: '' }).wa.hasAttribute('casora-offset'), 'fullscreen dialog: no offset');
assert.ok(!open('dashboard-casora', { width: 'full' }).wa.hasAttribute('casora-offset'), 'full-width dialog: no offset');

// The margin only exists behind the attribute and outside HA's phone layout
// (HA: max-width 450px or max-height 500px is fullscreen).
const css = dash.css;
const m = css.indexOf('margin-block-start');
assert.ok(m > 0, 'offset rule injected');
const guard = css.lastIndexOf('@media (min-width: 451px) and (min-height: 501px)', m);
assert.ok(guard >= 0 && css.lastIndexOf(':host([casora-offset]) dialog', m) > guard, 'offset behind media query and attribute');
assert.equal(css.split('margin-block-start').length, 2, 'no other top margin');
assert.equal(opened.length, 7, 'original showModal still runs');
console.log('ok dialog_offset_fullscreen');
