// Studio settings (the eight tiles since 03.11.2026, search hits): every icon name resolves to a real icon.
// iconUrl() falls back to the "default" icon for an unknown name – "Security: covers" (#76) asked for
// "cover_closed", which the Studio does not know, and showed a question mark.   node dev/unit/studio_settings_icons.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const { I } = await loadPanel();
assert.equal(typeof I.iconUrl, 'function', 'iconUrl in the panel internals');
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-settings.js', import.meta.url), 'utf8');
const names = [...new Set([...src.matchAll(/\bicon: "([\w-]+)"/g)].map((m) => m[1]))];
assert.ok(names.length >= 8, 'icon names found in casora-panel-settings.js (one per tile)');
const fallback = I.iconUrl('default');
const unknown = names.filter((n) => I.iconUrl(n) === fallback);
assert.deepEqual(unknown, [], 'icons without a picture (they show the fallback): ' + unknown.join(', '));
console.log('studio_settings_icons: ok (' + names.length + ' icons)');
