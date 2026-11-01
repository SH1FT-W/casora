// The Studio uses Inter twice: its own "Casora Studio Inter" (casora-panel-addons.js) and the dashboard
// "Inter" in the preview (assets/fonts/hanken-grotesk.css). Both must point at the same woff2 file, or the
// Studio downloads two copies of the same font (about 48 KB each) on every cold open.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const css = read('assets/fonts/hanken-grotesk.css');
const addons = read('panel/casora-panel-addons.js');

const face = /@font-face\s*\{[^}]*font-family:\s*'Inter'[^}]*src:\s*url\('([^']+)'\)/.exec(css);
assert.ok(face, 'dashboard @font-face Inter in hanken-grotesk.css');
const studio = /font-family:"Casora Studio Inter";'\s*\+\s*'src:url\("([^"]+)"\)/.exec(addons);
assert.ok(studio, 'Studio @font-face in casora-panel-addons.js');
assert.equal(face[1], studio[1], 'dashboard Inter and Studio Inter use one file');
assert.ok(fs.existsSync(new URL('../../custom_components/casora' + face[1].replace('/casora_assets', '/assets'), import.meta.url)), 'font file shipped');
console.log('ok inter_font_one_file');
