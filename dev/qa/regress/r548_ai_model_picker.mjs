// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel-settings.js#aiModelGroup,aiTaskPath,P._csHaGo,P._csHaOptions custom_components/casora/ki.py custom_components/casora/settings.py custom_components/casora/options.py
// Settings › AI › "AI models" (owner, 04.11.2026: the free text "Model name" in every row is hard for laypeople,
// the other settings offer a menu). The AI task always answers with the model chosen in its integration in HA; the
// name only tells Casora which model it is, to judge its strength.
//   - Model recognised (device or title of the AI task): no field in the row, it says "<model> · strong enough" and
//     "Change model" with a chevron; tapping it opens the AI task's entry on HA's integration page
//     (/config/integrations/integration/<domain>#config_entry=<entry_id>).
//   - Model unknown (the test house's AI task names none): a menu like the other settings with common models
//     (Claude Opus/Sonnet/Haiku, GPT, Gemini), "Not specified" and "Other…"; "Other…" reveals a text field.
//   - Picking a model and saving stores ai_task_models {entity_id: model}; afterwards Casora's own reading (label and
//     strength) shows the pick (Claude Haiku → too weak). A free name under "Other…" stays there after a reload.
//     "Not specified" clears it again ({} → option removed).
// The recognised row is faked in the browser (an extra AI task in the answer of casora/ki/models, the test house has
// only its own AI); navigation is recorded, not followed. Options are written on the test HA and restored.
// Pictures: CASORA_R548_BILDER=<folder> (1440 and 393 px, both cases).
import fs from 'node:fs';
import path from 'node:path';
import { ws } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, check, need, finish, atFinish } from './lib.mjs';

const BILDER = process.env.CASORA_R548_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

const dash = await studioDashboard();
await need('Dashboard fürs Studio', dash);
const c = await ws();
const optsOf = (r) => (r && r.options) || {};
const saved = optsOf(await c.cmd({ type: 'casora/options/get' }));
const models0 = await c.cmd({ type: 'casora/ki/models' });
const mine = (models0.all || []).find((m) => m.domain === 'casora_mock');
await need('Test-KI des Testhauses in casora/ki/models', !!mine, models0.all);
const ENT = mine.entity_id;
atFinish(async () => {
  const now = optsOf(await c.cmd({ type: 'casora/options/get' }));
  if (JSON.stringify(now) !== JSON.stringify(saved)) await c.cmd({ type: 'casora/options/set', options: { ...saved, ai_task_models: saved.ai_task_models || {} } });
  c.close();
});
// Start: nothing picked for the test AI.
if ((saved.ai_task_models || {})[ENT]) {
  const rest = { ...saved.ai_task_models }; delete rest[ENT];
  await c.cmd({ type: 'casora/options/set', options: { ...saved, ai_task_models: rest } });
}

const FAKE = { entity_id: 'ai_task.qa_claude', name: 'QA Claude', domain: 'anthropic', model: 'claude-sonnet-5-5', source: 'device',
  typed: '', label: 'Claude Sonnet 5.5', rank: 255, ok: true, entry_id: 'qa_entry_1', subentry_id: 'qa_sub_1', entry_domain: 'anthropic' };
const WANT_URL = '/config/integrations/integration/anthropic#config_entry=qa_entry_1';

const setup = async (page) => {
  await page.evaluate((FAKE) => {
    const ha = document.querySelector('home-assistant');
    window.__qaAi = { pushed: [] };
    const patch = (h) => {
      if (!h || h.__qaAi) return;
      const wsc = h.callWS.bind(h);
      h.callWS = async (msg) => {
        const r = await wsc(msg);
        if (msg && msg.type === 'casora/ki/models' && r && Array.isArray(r.all) && !r.all.some((m) => m.entity_id === FAKE.entity_id)) r.all.push({ ...FAKE });
        return r;
      };
      h.__qaAi = true;
    };
    patch(ha.hass);
    const orig = ha._updateHass;
    ha._updateHass = function (obj) { const r = orig.call(this, obj); patch(this.hass); return r; };
    const push = history.pushState.bind(history);
    history.pushState = function (st, t, url) {
      if (String(url || '').startsWith('/config/')) { window.__qaAi.pushed.push(String(url)); return; }
      return push(st, t, url);
    };
  }, FAKE);
};

const o = await open({ width: 1440, height: 900, dark: true });
const page = o.page;
usePage(page);
await studio(page, dash);
await setup(page);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const openAi = async () => {
  await P(`p._bOpen = true; await p._csShow('n-ai');`);
  await page.waitForFunction(() => window.__panel().shadowRoot.querySelectorAll('.cs-aimodel').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const ROW = `const R = p.shadowRoot; const vis = (e) => !!e && e.getClientRects().length > 0 && !e.hidden;
  const row = R.querySelector('.cs-aimodel[data-entity="' + arg.e + '"]');`;
const look = (e) => P(ROW + ` if (!row) return null;
  const inp = row.querySelector('input.fin'); const combo = row.querySelector('.combo input');
  return { tag: row.tagName, sub: (row.querySelector('.rtext > span') || {}).textContent || '', detail: (row.querySelector('.rdetail') || {}).textContent || '',
    chev: !!row.querySelector('.rchev'), combo: combo ? combo.value : null, field: vis(inp) ? inp.value : null,
    anyInput: [...row.querySelectorAll('input')].filter(vis).length };`, { e });
const menu = (e) => P(ROW + ` const inp = row && row.querySelector('.combo input'); if (!inp) return null; inp.click(); inp.focus();
  await new Promise((r) => setTimeout(r, 400));
  const names = [...R.querySelectorAll('.combo-opt')].filter((o) => o.getClientRects().length).map((o) => o.textContent.replace('\\u2713', '').trim());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); inp.blur(); await new Promise((r) => setTimeout(r, 300));
  return names;`, { e });
const pick = (e, label) => P(ROW + ` const inp = row && row.querySelector('.combo input'); if (!inp) return 'nocombo'; inp.click(); inp.focus();
  await new Promise((r) => setTimeout(r, 400));
  const opt = [...R.querySelectorAll('.combo-opt')].find((o) => o.getClientRects().length && new RegExp(arg.l).test(o.textContent.replace('\\u2713', '').trim()));
  if (!opt) return 'noopt'; (opt.pick ? opt.pick() : opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
  await new Promise((r) => setTimeout(r, 400)); return true;`, { e, l: label.source });
const type = (e, v) => P(ROW + ` const inp = row && row.querySelector('input.fin'); if (!vis(inp)) return false; inp.focus(); inp.value = arg.v;
  inp.dispatchEvent(new Event('input', { bubbles: true })); return true;`, { e, v });
const saveBar = () => P(`const bar = p.shadowRoot.querySelector('.cs-bar'); const btn = bar && bar.querySelector('.cs-save');
  if (!btn || btn.disabled) return { clicked: false };
  btn.click();
  for (let i = 0; i < 60 && (p._cs && p._cs.busy); i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1500));
  return { clicked: true, dirty: p._csDirty(), err: p._cs && p._cs.err };`);
const picture = async (pg, name) => { if (BILDER) await pg.screenshot({ path: path.join(BILDER, name + '.png'), fullPage: false }).catch(() => {}); };
const scrollTo = (pg) => pg.evaluate(() => { const r = window.__panel().shadowRoot.querySelector('.cs-aimodel'); if (r) r.scrollIntoView({ block: 'center' }); });

const STRONG = /stark genug|strong enough/;
const WEAK = /zu schwach|too weak/;
const NONE = /^(Keine Angabe|Not specified)$/;
const OTHER = /^(Anderes …|Other…)$/;

await openAi();
// ── Recognised model ─────────────────────────────────────────────────────────
const rec = await look(FAKE.entity_id);
await check('erkanntes Modell: Zeile ohne Eingabefeld, „Claude Sonnet 5.5 · stark genug“',
  !!rec && rec.anyInput === 0 && rec.combo === null && /Claude Sonnet 5\.5/.test(rec.sub) && STRONG.test(rec.sub), rec);
await check('erkanntes Modell: „Modell ändern“ mit Pfeil', !!rec && /Modell ändern|Change model/.test(rec.detail) && rec.chev && rec.tag === 'BUTTON', rec);

// ── Unknown model: the menu ──────────────────────────────────────────────────
const unk = await look(ENT);
await check('unbekanntes Modell: Auswahl auf „Keine Angabe“, kein Textfeld', !!unk && NONE.test(unk.combo || '') && unk.field === null, unk);
await scrollTo(page);
await picture(page, '1440-ai-models');
const names = await menu(ENT);
const want = [/^Claude Opus 5\.5$/, /^Claude Sonnet 5\.5$/, /^Claude Haiku 5\.5$/, /^GPT-5$/, /^Gemini 3 Pro$/, NONE, OTHER];
await check('Menü: gängige Modelle, „Keine Angabe“ und „Anderes …“', !!names && want.every((w) => names.some((n) => w.test(n))), names);

await check('„Anderes …“ zeigt ein Textfeld', (await pick(ENT, OTHER)) === true && (await look(ENT)).field === '', await look(ENT));
await picture(page, '1440-ai-models-other');
await check('Claude Haiku gewählt: Textfeld weg, Zeile sagt gleich „zu schwach“', (await pick(ENT, /^Claude Haiku 5\.5$/)) === true
  && (await look(ENT)).field === null && WEAK.test((await look(ENT)).sub), await look(ENT));
const s1 = await saveBar();
const o1 = optsOf(await c.cmd({ type: 'casora/options/get' }));
await check('gespeichert: ai_task_models {Test-KI: claude-haiku-5-5}', s1.clicked && !s1.err && (o1.ai_task_models || {})[ENT] === 'claude-haiku-5-5', { s1, m: o1.ai_task_models });
await page.waitForTimeout(800);
const after = await look(ENT);
await check('nach dem Speichern: Casoras Einschätzung „Claude Haiku 5.5 · zu schwach“, Auswahl steht auf Claude Haiku 5.5',
  !!after && /Claude Haiku 5\.5/.test(after.sub) && WEAK.test(after.sub) && after.combo === 'Claude Haiku 5.5', after);
const m1 = (await c.cmd({ type: 'casora/ki/models' })).all.find((m) => m.entity_id === ENT);
await check('casora/ki/models: Test-KI zählt als Claude Haiku (zu schwach)', m1 && m1.source === 'typed' && m1.ok === false && m1.label === 'Claude Haiku 5.5', m1);

// ── Free name under "Other…", read back after a reload ───────────────────────
await pick(ENT, OTHER);
await type(ENT, 'qa-model-x');
const s2 = await saveBar();
const o2 = optsOf(await c.cmd({ type: 'casora/options/get' }));
await check('freier Name gespeichert', s2.clicked && (o2.ai_task_models || {})[ENT] === 'qa-model-x', { s2, m: o2.ai_task_models });
await page.reload({ waitUntil: 'domcontentloaded' });
await studio(page, dash);
await setup(page);
await openAi();
const back = await look(ENT);
await check('nach Neuladen: „Anderes …“ mit dem freien Namen im Feld', !!back && OTHER.test(back.combo || '') && back.field === 'qa-model-x', back);

// ── "Not specified" clears it ────────────────────────────────────────────────
await pick(ENT, NONE);
const s3 = await saveBar();
const o3 = optsOf(await c.cmd({ type: 'casora/options/get' }));
await check('„Keine Angabe“: Eintrag entfernt', s3.clicked && !((o3.ai_task_models || {})[ENT]), { s3, m: o3.ai_task_models });
await page.waitForTimeout(800);
const cleared = await look(ENT);
await check('danach wieder „Modell unbekannt · stark genug“ (Test-KI)', !!cleared && /Modell unbekannt|Model unknown/.test(cleared.sub) && STRONG.test(cleared.sub), cleared);

// ── The link ────────────────────────────────────────────────────────────────
await P(ROW + ` row.click(); await new Promise((r) => setTimeout(r, 800));`, { e: FAKE.entity_id });
const pushed = await page.evaluate(() => window.__qaAi.pushed);
await check('„Modell ändern“ öffnet den Eintrag auf der Integrationsseite von HA', pushed.includes(WANT_URL), pushed);
await o.browser.close();

// ── Phone: both cases fit ────────────────────────────────────────────────────
const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
usePage(ph.page);
await studio(ph.page, dash);
await setup(ph.page);
const PP = (src, a) => ph.page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
await PP(`p._bOpen = true; await p._csShow('n-ai');`);
await ph.page.waitForFunction(() => window.__panel().shadowRoot.querySelectorAll('.cs-aimodel').length >= 2, null, { timeout: 15000 }).catch(() => {});
await ph.page.waitForTimeout(600);
const fit = await PP(`const R = p.shadowRoot; const rows = [...R.querySelectorAll('.cs-aimodel')];
  return rows.map((r) => { const b = r.getBoundingClientRect(); const wide = [...r.querySelectorAll('*')].filter((x) => x.getClientRects().length && !x.hidden
    && (x.getBoundingClientRect().right > b.right + 1 || x.getBoundingClientRect().left < b.left - 1)).length;
    return { e: r.dataset.entity, w: Math.round(b.width), wide, combo: !!r.querySelector('.combo'), detail: (r.querySelector('.rdetail') || {}).textContent || '' }; });`);
await check('393 px: beide Zeilen ohne Überstand, Auswahl bzw. „Modell ändern“', fit.length >= 2 && fit.every((x) => !x.wide)
  && fit.some((x) => x.e === FAKE.entity_id && /Modell ändern|Change model/.test(x.detail)) && fit.some((x) => x.e === ENT && x.combo), fit);
await scrollTo(ph.page);
await picture(ph.page, '393-ai-models');
await ph.browser.close();
await finish();
