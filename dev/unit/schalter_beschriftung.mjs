// Studio-Schalter (_boolSwitch): Ein Klick auf die Beschriftung direkt davor schaltet mit
// (Nutzertest 6, „12-Stunden-Uhr“). Aber nur dieses eine Geschwister und nie in Zeilen mit eigenem
// Klick: im Kachelkopf der Liste blendete ein Tipp auf den Kachelnamen sonst die Kachel aus
// (Review 1.1.1). Kleines Ersatz-DOM, ohne Browser.   node dev/unit/schalter_beschriftung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('\n  _boolSwitch(');
const b = src.indexOf('\n  }\n', a);
assert.ok(a > 0 && b > a, '_boolSwitch nicht gefunden');
const P = new Function('return ({' + src.slice(a, b + 4) + '});')();

// Ersatz-DOM: Elemente mit Kindern, Klassen, Klick mit Aufsteigen zu onclick/Listenern der Eltern.
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.kids = []; this.parentElement = null; this.cls = new Set(); this.ls = []; this.attrs = {}; this.onclick = null; this.disabled = false; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() { const s = this.cls; return { add: (c) => s.add(c), contains: (c) => s.has(c) }; }
  setAttribute(k, v) { this.attrs[k] = v; }
  get isConnected() { return true; }
  append(...xs) { xs.forEach((x) => { x.parentElement = this; this.kids.push(x); }); }
  appendChild(x) { this.append(x); return x; }
  get previousElementSibling() { const p = this.parentElement; if (!p) return null; const i = p.kids.indexOf(this); return i > 0 ? p.kids[i - 1] : null; }
  matches(sel) { return sel.split(',').map((s) => s.trim()).some((s) => (s[0] === '.' ? this.cls.has(s.slice(1)) : this.tagName === s.toUpperCase())); }
  querySelector(sel) { for (const k of this.kids) { if (k.matches(sel)) return k; const d = k.querySelector(sel); if (d) return d; } return null; }
  addEventListener(t, f) { if (t === 'click') this.ls.push(f); }
  click() {
    const ev = { target: this, defaultPrevented: false, stopped: false, stopPropagation() { this.stopped = true; } };
    for (let n = this; n && !ev.stopped; n = n.parentElement) { if (n.onclick) n.onclick(ev); n.ls.forEach((f) => f(ev)); }
  }
}
globalThis.document = { createElement: (t) => new El(t) };
const tick = () => new Promise((r) => setTimeout(r, 5));

// 1) Einstellungszeile: Beschriftung + Schalter – Klick auf die Beschriftung schaltet.
{
  const row = new El('div'); const lab = new El('label');
  let val = 'unberührt';
  const sw = P._boolSwitch(false, false, (v) => { val = v; }, '12-Stunden-Uhr');
  row.append(lab, sw);
  await tick();
  lab.click();
  assert.equal(val, true, 'Beschriftung schaltet den Schalter');
  assert.equal(sw.attrs['aria-checked'], 'true');
}

// 2) Kachelkopf der Liste: Name klappt auf (onclick am Kopf), „Sichtbar“ + Schalter daneben.
{
  const head = new El('div'); let folds = 0;
  head.onclick = (ev) => { if (ev.target.tagName === 'BUTTON' && !ev.target.cls.has('fold')) return; folds++; };
  const icon = new El('span'); const title = new El('div'); title.className = 'grow';
  const fold = new El('button'); fold.className = 'fold';
  const lab = new El('span'); lab.className = 'bandtog tswlab';
  let enabled = 'unberührt';
  const sw = P._boolSwitch(true, true, (v) => { enabled = v; }, 'Show this tile on the dashboard');
  head.append(icon, title, fold, lab, sw);
  await tick();
  title.click();
  assert.equal(enabled, 'unberührt', 'Tipp auf den Kachelnamen blendet die Kachel nicht aus');
  assert.equal(folds, 1, 'Tipp auf den Namen klappt auf');
  assert.ok(!title.cls.has('swlabel') && !icon.cls.has('swlabel'), 'Name und Symbol sind keine Beschriftung des Schalters');
  sw.click();
  assert.equal(enabled, false, 'der Schalter selbst schaltet weiter');
}

// 3) Nur das direkte Geschwister: ein Text weiter vorn schaltet nicht.
{
  const row = new El('div'); const far = new El('span'); const lab = new El('span');
  let val = 'unberührt';
  const sw = P._boolSwitch(false, false, (v) => { val = v; });
  row.append(far, lab, sw);
  await tick();
  far.click();
  assert.equal(val, 'unberührt', 'entferntes Geschwister schaltet nicht');
}
console.log('ok schalter_beschriftung');
