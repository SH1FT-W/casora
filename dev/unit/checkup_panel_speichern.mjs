// Studio: Speichern, Dashboard-Wechsel, Anlegen und Aufräumen ohne Browser.
//   node dev/unit/checkup_panel_speichern.mjs
// Checkup 10/2026:
// - _save sperrt sofort (vor dem ersten await) und löst die Sperre in jedem Ausstieg.
// - Wird während des Speicherns ein anderes Dashboard geladen, schreibt der alte Lauf nichts in
//   dessen Stand (_raw, _clean) bzw. bricht vor dem Absenden ab; _load wartet aufs Speichern.
// - _ownTemplates gehört zum geladenen Dashboard (sonst landen Vorlagen aus A beim Speichern in B).
// - _create löscht ein angelegtes, aber nicht beschriebenes Dashboard wieder; ebenso der Import die
//   Handy-Hälfte, bevor _createMobileSibling neu anlegt.
// - Der ResizeObserver am Eltern-Element wird beim Aushängen getrennt.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const method = (head) => {
  const at = src.indexOf('\n  ' + head);
  assert.ok(at > 0, head + ' nicht gefunden');
  const open = src.indexOf('{\n', at);
  return src.slice(open + 2, src.indexOf('\n  }\n', at));
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── _save: Sperre sofort, Lösen auch bei Fehler, zweiter Aufruf wartet ─────────────
{
  const save = new Function('return async function () {' + method('async _save() {') + '\n};')();
  let release;
  const runs = [];
  const panel = {
    _state: { compact: { rooms: [] } }, _saveBlocked: false, _dashUrl: 'casora-a', _stateUrl: 'casora-a',
    _pair: null, _status() {}, _log() {}, _markDirty() {}, _isDirty: () => true,
    _print: () => 'x', _syncFilterOptions: async () => {},
    _saveRun(s, url, pair) { runs.push([s, url, pair]); return new Promise((r) => { release = r; }); },
    _save() { return save.call(this); },
  };
  const p1 = panel._save();
  assert.equal(panel._saving, true, '_saving vor dem ersten await');
  const p2 = panel._save();   // zweiter Klick / ⌘S
  await tick();
  assert.equal(runs.length, 1, 'zweites Speichern läuft nicht parallel');
  panel._isDirty = () => false;
  release(true);
  assert.equal(await p1, true);
  assert.equal(await p2, true, 'wartet und meldet das Ergebnis des laufenden');
  assert.equal(runs.length, 1, 'nichts mehr offen → kein zweiter Lauf');
  assert.equal(panel._saving, false, 'Sperre gelöst');
  assert.equal(runs[0][1], 'casora-a', 'url_path vom Start');

  // Fehler im Lauf: Sperre trotzdem gelöst.
  panel._saveRun = async () => { throw new Error('kaputt'); };
  await assert.rejects(panel._save());
  assert.equal(panel._saving, false, 'nach Fehler gelöst');
}

// ── _saveRun: anderes Dashboard geladen → abbrechen bzw. _raw/_clean nicht überschreiben ──
{
  const run = new Function('omit', 'stable', 'clone', 'expandAny', 'applyKiosk', 'dropRetiredVars',
    'markPhoneManaged', 'FINGERPRINT_KEY',
    'return async function (s, url_path, pair) {' + method('async _saveRun(s, url_path, pair) {') + '\n};')(
    (o, keys) => { const r = { ...o }; keys.forEach((k) => delete r[k]); return r; },
    JSON.stringify, (o) => JSON.parse(JSON.stringify(o)),
    () => ({ views: [{ path: 'x' }] }), () => {}, () => {}, (c) => c, 'casora_fp');
  const mk = () => {
    const s = { surface: 'mobile', compact: { rooms: [] }, templates: {}, extras: {}, scaffold: {} };
    const B = { surface: 'mobile', compact: { rooms: [] } };
    const writes = [];
    const panel = {
      _state: s, _pair: null, _raw: { mine: 'A' }, _clean: 'alt',
      _log() {}, _status() {}, _markDirty() {}, _saveFlash() {}, _resetUndo() {}, _dropDraft() {},
      _print: () => 'p', _bundleOnce: async () => { throw new Error('kein Bundle'); },
      _ws: async () => ({ views: [] }),
      _hass: { callWS: async (m) => { writes.push(m); } },
    };
    return { s, B, writes, panel };
  };
  // Wechsel während des Wiederlesens: nichts absenden.
  {
    const { s, B, writes, panel } = mk();
    panel._ws = async () => { panel._state = B; return { views: [] }; };
    assert.equal(await run.call(panel, s, 'casora-a', null), false, 'abgebrochen');
    assert.equal(writes.length, 0, 'nichts gespeichert');
  }
  // Wechsel während des Absendens: gespeichert, aber _raw/_clean des neuen Dashboards bleiben.
  {
    const { s, B, writes, panel } = mk();
    panel._hass.callWS = async (m) => { writes.push(m); panel._state = B; panel._raw = { mine: 'B' }; panel._clean = 'B'; };
    assert.equal(await run.call(panel, s, 'casora-a', null), true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].url_path, 'casora-a', 'an A gespeichert');
    assert.deepEqual(panel._raw, { mine: 'B' }, '_raw von B unberührt');
    assert.equal(panel._clean, 'B', '_clean von B unberührt');
  }
  // Normalfall: _raw und _clean werden gesetzt.
  {
    const { s, panel } = mk();
    assert.equal(await run.call(panel, s, 'casora-a', null), true);
    assert.deepEqual(panel._raw, { views: [{ path: 'x' }] });
    assert.equal(panel._clean, 'p');
  }
  // Zwischen Bauen von cfg und Absenden liegt kein await mehr (Handy-Hälfte wird vorher gelesen).
  const body = method('async _saveRun(s, url_path, pair) {');
  const between = body.slice(body.indexOf('const built = expandAny('), body.indexOf('savedPrint = this._print();'));
  assert.ok(!/\bawait\b/.test(between), 'kein await zwischen cfg und Fingerabdruck');
}

// ── _load: wartet aufs Speichern, setzt _ownTemplates zurück ───────────────────────
{
  const body = method('async _load() {');
  const first = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'))[0];
  assert.equal(first, 'if (this._saving && this._saveWait) await this._saveWait;', '_load wartet zuerst');
  assert.ok(/this\._stateUrl = url_path;\s*\n(\s*\/\/[^\n]*\n)*\s*this\._ownTemplates = \{\};/.test(body),
    '_ownTemplates mit dem neuen Stand zurückgesetzt');
}

// ── _create: Dashboard angelegt, Speichern scheitert → wieder löschen ─────────────
{
  const body = method('async _create(url_path, title, picked, filled) {');
  const create = new Function('blankRoom', 'roomPhoto', 'slug', 'fingerprintOf', 'sceneBadgeOn', 'expandConfig',
    'retargetRoutes', 'dropNavScenes', 'applyKiosk', 'dropRetiredVars', 'FINGERPRINT_KEY',
    'return async function (url_path, title, picked, filled) {' + body + '\n};')(
    (name, path, image) => ({ name, path, tiles: [], variables: { image } }), () => '', (n) => n, () => ({}),
    () => {}, () => ({ views: [] }), (c) => ({ config: c, rewritten: 1 }), () => {}, () => {}, () => {}, 'fp');
  const mk = (failSave) => {
    const calls = [];
    const panel = {
      _flowScreen: () => ({ body: {}, acts: {} }), _flowProgress: () => ({ at() {} }), _clearLog() {}, _log() {},
      _bundleOnce: async () => ({ templates: {}, scaffold: {} }), _images: async () => [],
      _hass: { states: {}, callWS: async (m) => {
        calls.push(m);
        if (m.type === 'lovelace/dashboards/create') return { id: 'dash1' };
        if (m.type === 'lovelace/config/save' && failSave) throw new Error('voll');
        return {};
      } },
      _createMobileSibling: async () => true, _flowRelist: async () => {}, _flowDone() {}, _ensureTheme: async () => null,
      _flowError() {}, _flowCancel() {}, _flowButton() {}, _createForm() {},
    };
    return { calls, panel };
  };
  {
    const { calls, panel } = mk(true);
    await create.call(panel, 'casora-neu', 'Neu', []);
    assert.deepEqual(calls.map((c) => c.type),
      ['lovelace/dashboards/create', 'lovelace/config/save', 'lovelace/dashboards/delete'], 'angelegt → wieder gelöscht');
    assert.equal(calls[2].dashboard_id, 'dash1');
  }
  {
    const { calls, panel } = mk(false);
    panel._flowDone = () => { throw new Error('Anzeige'); };   // Fehler nach dem Speichern: Dashboard bleibt
    await create.call(panel, 'casora-neu', 'Neu', []);
    assert.ok(!calls.some((c) => c.type === 'lovelace/dashboards/delete'), 'gespeichertes Dashboard bleibt');
  }
}

// ── Import: Handy-Hälfte angelegt, Speichern scheitert → vor dem Neuaufbau löschen ──
{
  const at = src.indexOf('const mmade = await this._hass.callWS({');
  const blk = src.slice(src.lastIndexOf('if (sib) {', at), src.indexOf('if (!paired) {', at));
  const iDel = blk.indexOf('type: "lovelace/dashboards/delete", dashboard_id: mobileMade.id');
  assert.ok(iDel > blk.indexOf('phone layout not imported'), 'innerer catch löscht die Handy-Hälfte');
  assert.ok(/created\.splice\(created\.indexOf\(mobileMade\), 1\)/.test(blk), 'aus „created“ genommen');
}

// ── ResizeObserver: aushängen trennt, einhängen beobachtet wieder ────────────────
{
  const conn = new Function(method('connectedCallback() {'));
  const disc = new Function(method('disconnectedCallback() {'));
  const log = [];
  const parent = {};
  const panel = {
    _built: true, _gOff: false, _gList: [], parentElement: parent, style: {},
    _slotObs: { disconnect() { log.push('aus'); }, observe(el) { log.push(el === parent ? 'an' : '?'); } },
  };
  disc.call(panel);
  conn.call(panel);
  assert.deepEqual(log, ['aus', 'an']);
}

console.log('ok checkup_panel_speichern');
