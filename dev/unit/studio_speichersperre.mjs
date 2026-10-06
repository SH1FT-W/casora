// Studio: „Speichern ist aus“ gilt für jeden Weg, nicht nur für den Knopf.
//   node dev/unit/studio_speichersperre.mjs
// Code-Audit 06.10.2026 (B-PA-01): Kann das Studio ein Dashboard nicht verlustfrei nachbauen, setzt es
// _saveBlocked. Geräte-Assistent, „Neue Szene“ und die Einstellungen riefen _save() aber direkt auf und
// überschrieben das Dashboard trotzdem. Hier ohne Browser: _save() selbst bricht ab und schreibt nichts.
// Dazu B-PA-03: als gespeichert gilt der Stand beim Absenden, nicht der nach dem Warten aufs Netz.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const at = src.indexOf('\n  async _save() {');
assert.ok(at > 0, '_save nicht gefunden');
const end = src.indexOf('\n  }\n', at);
const body = src.slice(at + '\n  async _save() {'.length, end);
const save = new Function('return async function () {' + body + '\n};')();

const writes = [];
const panel = {
  _state: { compact: { rooms: [] } }, _saveBlocked: true, _dashUrl: 'casora-test', _stateUrl: 'casora-test',
  _hass: { callWS: async (m) => { writes.push(m); return {}; } },
  _ws: async (m) => { writes.push(m); return {}; },
  _status(msg, kind) { this.msg = [msg, kind]; }, _log() {}, _print: () => 'x',
};
assert.equal(await save.call(panel), false, 'gesperrt → false');
assert.equal(writes.length, 0, 'gesperrt → kein Aufruf an HA');
assert.equal(panel.msg && panel.msg[1], 'err', 'gesperrt → Hinweis');

// Fingerabdruck vor dem Bauen, gesetzt als _clean nach dem Speichern.
assert.ok(/savedPrint = this\._print\(\);\s*\n\s*await this\._hass\.callWS\(\{ type: "lovelace\/config\/save", url_path, config: cfg \}\)/.test(src), "Fingerabdruck direkt vor dem Speichern");
assert.ok(/this\._clean = savedPrint \|\| this\._print\(\);/.test(src), '_clean = Stand beim Absenden');
// Gespeichert wird an das Dashboard, aus dem der Stand stammt.
assert.ok(/const url_path = this\._stateUrl \|\| this\._dashUrl;/.test(body), 'Ziel = _stateUrl');
console.log('ok studio_speichersperre');
