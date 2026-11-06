// Owner, 06.11.2026: „Diagramme sind nicht immer mit Verlauf“. The standard of a chart that complements a wheel
// (richtlinien §7.1/§7.2, Abschnitt „Verlauf“): casora-chart line (2 px, area 12 % → 0), 24 h, 120 high, the reading in
// its own head. The thermostat, floor heating, humidifier, kettle, fridge, oven and free tile follow it; the v3 climate
// popup showed 6 h, the v3 network popup 2 h at 104 high.
//   node dev/unit/chart_verlauf_standard.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));

// Climate v3: the Verlauf under the wheel.
{
  const c = T.casora_climate_popup.tap_action.casora_popup.content;
  const v3 = c.slice(c.indexOf('const _v3k ='), c.indexOf('areas.forEach(', c.indexOf('const _v3k =')));
  assert.match(v3, /graphCard\.height = 120;/, 'climate v3: 120 high');
  assert.match(v3, /graphCard\.span = '24h';/, 'climate v3: 24 h');
}
// Network v3: the throughput Verlauf, its title follows the span.
{
  const c = T.casora_popup_network.tap_action.casora_popup.content;
  assert.match(c, /if \(UI\.v3 && UI\.v3\(\)\) Object\.assign\(_gc, \{ readout: 'own', span: '24h', bucket: '15min', height: 120 \}\);/, 'network v3: 24 h, 120');
  assert.match(c, /_hpPlantMeta\[_hpNetKey\] = \['Download & Upload', _gc\.span, dlCol\]/, 'network: title says the span shown');
}
// Every Verlauf plate of a module (casora-chart literal, plate, 120 high) shows 24 h as a line.
{
  const dir = new URL('../../custom_components/casora/scripts/local/', import.meta.url);
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const s = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of s.matchAll(/\{ type: 'custom:casora-chart',([\s\S]*?)\}, do_not_eval: true \}/g)) {
      const cfg = m[1];
      if (!/plate: true/.test(cfg) || !/height: (?:120|v3 \? 120)/.test(cfg)) continue;
      n++;
      assert.match(cfg, /kind: 'line'/, f + ': a Verlauf is a line with its area');
      assert.match(cfg, /span: '24h'/, f + ': a Verlauf shows 24 h');
      assert.match(cfg, /readout: 'own'/, f + ': a Verlauf reads in its own head');
    }
  }
  assert.ok(n >= 5, 'Verlauf plates found: ' + n);
}
console.log('chart_verlauf_standard: ok');
