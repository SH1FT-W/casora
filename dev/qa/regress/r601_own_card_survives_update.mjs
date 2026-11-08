// @zustand: arbeit
// @parallel: allein   (saves the dashboard and restores it at the end)
// @deckt: custom_components/casora/template_print.py custom_components/casora/panel/casora-panel.js#_installTemplate,refreshTemplates
// Issue #143: can someone build cards of their own on Casora's logic without an update overwriting them? Expected: a
// template pasted in the Studio (name without casora_, inheriting casora_entity) and its tile survive a Studio save and
// the automatic template refresh of a Casora update (refresh_dashboard with a changed bundle), still render, and
// the Casora template that changed is updated next to it. Restores the dashboard.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const NAME = 'qa_own_card';
const TEMPLATE = { template: ['casora_entity'], name: 'QA own card', variables: { qa_marker: 'kept' } };
const dash = await casoraDashboard();
await need('Casora dashboard', dash);
const read = async () => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: dash.url }); } finally { c.close(); } };
const write = async (cfg) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); } finally { c.close(); } };
const orig = await read();
atFinish(() => write(orig));
const FP = 'casora_template_fingerprint';
const uses = (cfg) => JSON.stringify(cfg.views).includes(`"${NAME}"`);

// The way a user adds one: Custom card → pasted template, then save.
const { page } = await open({ width: 1440, height: 900 });
usePage(page);
await studio(page, dash.url);
const added = await page.evaluate(async ([name, template]) => {
  const p = window.__panel(), I = window.__casoraPanelInternals, rooms = p._state.compact.rooms;
  const room = rooms.find((r) => !I.isHomeRoom(r, rooms));
  if (!room) return { error: 'no room' };
  p._installTemplate(room, { name, template });
  p._markDirty();
  return { room: room.name, saved: await p._save() };
}, [NAME, TEMPLATE]);
await need('Studio added and saved the tile', added.room && added.saved !== false, added);
let cfg = await read();
await check('Studio save: template stored as written', JSON.stringify(cfg.button_card_templates[NAME]) === JSON.stringify(TEMPLATE), cfg.button_card_templates[NAME]);
await check('Studio save: the room holds its tile', uses(cfg));
await check('Studio save: no fingerprint, so it stays the user\'s', cfg[FP] && cfg[FP][NAME] === undefined);

// A Casora update: the same refresh as after an update, against a bundle in which one Casora template changed.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r601-'));
const inFile = path.join(tmp, 'in.json'), outFile = path.join(tmp, 'out.json');
const bundle = JSON.parse(fs.readFileSync('custom_components/casora/panel/casora-templates.json', 'utf8')).templates;
const PROBE = 'casora_scene_row';
bundle[PROBE] = { ...bundle[PROBE], qa_update_marker: true };
fs.writeFileSync(inFile, JSON.stringify({ cfg, bundle }));
execFileSync('python3', ['-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('tp', 'custom_components/casora/template_print.py')
tp = importlib.util.module_from_spec(spec); sys.modules['tp'] = tp; spec.loader.exec_module(tp)
d = json.load(open(sys.argv[1], encoding='utf-8'))
new, res = tp.refresh_dashboard(d['cfg'], d['bundle'])
json.dump({'cfg': new, 'foreign': res['foreign'], 'updated': res['updated']}, open(sys.argv[2], 'w', encoding='utf-8'))
`, inFile, outFile]);
const up = JSON.parse(fs.readFileSync(outFile, 'utf8'));
fs.rmSync(tmp, { recursive: true });
await need('the update had something to do', up.cfg && up.updated >= 1, { updated: up.updated });
await check('Update: counted as the user\'s own', up.foreign.includes(NAME), up.foreign);
await check('Update: template unchanged', JSON.stringify(up.cfg.button_card_templates[NAME]) === JSON.stringify(TEMPLATE));
await check('Update: rooms unchanged', JSON.stringify(up.cfg.views) === JSON.stringify(cfg.views));
await check('Update: the changed Casora template did update', up.cfg.button_card_templates[PROBE].qa_update_marker === true);
await write(up.cfg);

// It still works afterwards.
const view = up.cfg.views.find((v) => JSON.stringify(v).includes(`"${NAME}"`));
await need('view with the tile', view);
await dashboard(page, dash.url + '/' + view.path, 3);
let shown = null;
for (let i = 0; i < 20 && !(shown && shown.ok); i++) {
  await page.waitForTimeout(500);
  shown = await page.evaluate((name) => {
    const row = window.__pierce('casora-smart-row').find((r) => [...(r.children || [])].length);
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(name));
    if (!b) return { ok: false, found: false, cards: window.__pierce('button-card').length, row: !!row };
    b.scrollIntoView({ inline: 'center', block: 'center' });
    const card = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
    const box = b.getBoundingClientRect();
    return { ok: !!card && box.width > 0, found: true, width: box.width, text: card ? card.textContent.trim().slice(0, 60) : null, error: /error/i.test(card ? card.textContent : ''), marker: (b._config.variables || {}).qa_marker };
  }, NAME);
}
await check('After the update the tile draws, on Casora\'s base', shown && shown.ok && !shown.error && shown.marker === 'kept', shown);

// And one more Studio save after the update.
await studio(page, dash.url);
const again = await page.evaluate(async () => { const p = window.__panel(); p._markDirty(); return { saved: await p._save() }; });
cfg = await read();
await check('Saved again: template and tile still there', again.saved !== false && JSON.stringify(cfg.button_card_templates[NAME]) === JSON.stringify(TEMPLATE) && uses(cfg), again);
await finish();
