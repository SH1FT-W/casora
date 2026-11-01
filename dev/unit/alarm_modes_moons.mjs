// Owner (01.11.2026, prod): the alarm popup's moons offered only Abwesend / Zuhause / Nacht – vacation and custom bypass
// were missing. Every arm mode the panel supports (supported_features) is offered: up to 4 as moons, more → the first 3
// and „Alle (n)“ leading to the sub page „alarmModes“ with every mode. „Unscharf“ stays the stage's pill, never a moon.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/07-weich-spezial.js', import.meta.url), 'utf8');
const pages = {};
let lastQuick = null;
const win = {
  CSS: null, addEventListener: () => {}, removeEventListener: () => {},
  _casoraUI: {
    quick: (items, label, o) => { lastQuick = { items, label, o }; return '<div data-casora-svc="x"></div>'; },
    page: (name, fn) => { pages[name] = fn; },
  },
};
new Function('window', 'document', 'CSS', src)(win, { querySelector: () => null, addEventListener: () => {} }, null);
const AL = win._casoraAlarmSoft;
const panel = (feat, state = 'disarmed') => ({ 'alarm_control_panel.home': { state, attributes: { supported_features: feat } } });
const texts = () => lastQuick.items.map((x) => x.text);

AL.quick('alarm_control_panel.home', panel(1 | 2 | 4));
assert.deepEqual(texts(), ['Abwesend', 'Zuhause', 'Nacht'], 'three modes');
AL.quick('alarm_control_panel.home', panel(1 | 2 | 4 | 32));
assert.deepEqual(texts(), ['Abwesend', 'Zuhause', 'Nacht', 'Urlaub'], 'vacation offered');
AL.quick('alarm_control_panel.home', panel(1 | 2 | 4 | 16 | 32, 'armed_vacation'));
assert.deepEqual(texts(), ['Abwesend', 'Zuhause', 'Nacht', 'Urlaub', 'Bypass'], 'all five handed to the moons (they show 3 + „Alle (5)“)');
assert.equal(lastQuick.items.find((x) => x.text === 'Urlaub').active, true, 'the armed mode is the chosen moon');
assert.equal(lastQuick.items.find((x) => x.text === 'Bypass').svc.service, 'alarm_arm_custom_bypass');
assert.equal(lastQuick.o.page, 'alarmModes|alarm_control_panel.home', '„Alle (n)“ opens the modes page');
assert.ok(typeof pages.alarmModes === 'function', 'modes page registered');
assert.ok(!texts().some((t) => /^(unscharf|aus)\b/i.test(t)), 'never disarm as a moon');
// The page's rows: every supported mode.
let rows = null;
AL.modes = function (ent, modes) { rows = modes; return ''; };
AL.modeRows('alarm_control_panel.home', panel(1 | 2 | 16));
assert.deepEqual(rows.map((m) => m.id), ['armed_away', 'armed_home', 'armed_custom_bypass']);
console.log('alarm_modes_moons: ok');
