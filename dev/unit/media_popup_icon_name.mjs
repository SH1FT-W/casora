// @deckt: dashboards/casora/button_card_templates.json#casora_media,casora_now_playing_chip,casora_now_playing_primary
// Media popup: the device symbol name from the card config (variables.icon) goes into a style attribute as
// url('/casora_assets/icons/<name>.svg'), so only plain symbol names are taken; anything else shows "media".
//   node dev/unit/media_popup_icon_name.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const name of ['casora_media', 'casora_now_playing_chip', 'casora_now_playing_primary']) {
  const src = JSON.stringify(tpl[name]);
  // The popup body is a JS string inside the template: undo that one level of string escaping.
  const m = src.match(/const devIcon = ((?:[^;]|;(?!\\\\n))*?);\\\\n/);
  assert.ok(m, name + ': devIcon found');
  const expr = JSON.parse('"' + JSON.parse('"' + m[1] + '"') + '"');
  const devIcon = (variables) => new Function('variables', 'return (' + expr + ');')(variables);
  assert.equal(devIcon({ icon: 'playstation' }), 'ps5', name + ': playstation');
  assert.equal(devIcon({ icon: 'apple-tv' }), 'apple-tv', name + ': plain name kept');
  assert.equal(devIcon({}), 'media', name + ': default');
  assert.equal(devIcon({ icon: 'x" onmouseover="alert(1)" a="' }), 'media', name + ': no attribute break-out');
  assert.equal(devIcon({ icon: "x') ;background:url('//evil" }), 'media', name + ': no CSS break-out');
}
console.log('ok media_popup_icon_name');
