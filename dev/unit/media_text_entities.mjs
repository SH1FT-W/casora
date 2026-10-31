// #97: a player (WiiM/LinkPlay) sends its metadata with XML/HTML entities in it – the media popup showed
// „Livin&apos; on the edge“. casoraDecodeEntities makes plain text of it; the media popup, the tile's state line, the
// now-playing list (_casoraNPSources) and the media badge read title and artist through it. #97 also: with the
// popup's own cards, the content keeps its full height (the cards stand under it, never over it).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('// Media metadata as plain text (#97)');
assert.ok(a > 0, 'block in casora-core');
const src = core.slice(a, core.indexOf('})();', a) + 5);
const w = {};
new Function('window', src)(w);
const d = w.casoraDecodeEntities;
assert.equal(d('Livin&apos; on the edge'), "Livin' on the edge");
assert.equal(d('Tom &amp; Jerry &quot;Live&quot; &lt;3'), 'Tom & Jerry "Live" <3');
assert.equal(d('Don&#39;t &#x2019;n&#8217;'), 'Don\'t ’n’');
assert.equal(d('Rock &amp;apos;n&amp;apos; Roll'), "Rock 'n' Roll", 'escaped twice at the source');
assert.equal(d('AT&T &unknown; &#0; & co'), 'AT&T &unknown; &#0; & co', 'everything else stays');
assert.equal(d('  plain  '), 'plain');
assert.equal(d(null), '');
assert.equal(d(undefined), '');

// The places that show a media title read it through the helper.
assert.ok(/const dec = window\.casoraDecodeEntities \|\| norm;\s*const rawTitle = dec\(a\.media_title\)/.test(core), '_casoraNPSources');
const badge = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/32-media-badge.js', import.meta.url), 'utf8');
assert.ok(/var title = dec\(a\.media_title/.test(badge), 'media badge');
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
assert.ok(/const title {2}= dec\(a\.media_title/.test(tpl.casora_media.state_display), 'media tile state line');
assert.ok(/dec\(a\.media_title\) \|\| a\.app_name/.test(tpl.casora_media.tap_action.casora_popup.content), 'media popup');

// Own cards under the content: the container may not shrink while they are there.
assert.ok(/:host\(\[has-extra\]\) \.content > \.container \{ flex-shrink: 0 !important; \}/.test(core), 'no shrinking container');
assert.ok(/box\.hidden = false;\s*this\.setAttribute\('has-extra', ''\);/.test(core), 'attribute set with the cards');
assert.equal((core.match(/this\.removeAttribute\('has-extra'\)/g) || []).length, 2, 'attribute cleared on rebuild and close');
console.log('ok media_text_entities');
