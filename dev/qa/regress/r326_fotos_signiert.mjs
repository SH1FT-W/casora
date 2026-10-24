// @zustand: arbeit
// @parallel: allein   (creates qa-fotos as a copy of the Casora desktop dashboard, deleted at the end)
// @deckt: custom_components/casora/images.py custom_components/casora/assets.py
// HACS default-store review (hacs/default#12143, point 1): uploaded room photos lay in /config/www/casora and
// /casora_assets served them with requires_auth = False – anyone reaching HA could fetch them.
// Expected: an uploaded photo lands outside www, the dashboard shows it through a signed URL (authSig) from
// casora/photos, the image really loads in the browser, and the same photo WITHOUT login/signature answers
// 401 (signed route) or 404 (old public routes /casora_assets/rooms, /local/casora/rooms). A tampered or
// foreign signature is refused too.
import { open, casoraDashboard, dashboard, stable, check, need, finish, atFinish, BASE } from './lib.mjs';
import { tokens, ws } from '../ws.mjs';

// Small JPEG (16×10, brown), no Pillow needed.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAKABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDLooorkOo//9k=',
  'base64');

const { access_token } = await tokens();
const auth = { Authorization: 'Bearer ' + access_token };

// (1) Upload through the Studio's endpoint.
const form = new FormData();
form.append('name', 'qa fotos privat');
form.append('variant', 'day');
form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'qa.jpg');
const up = await fetch(BASE + '/api/casora/images', { method: 'POST', headers: auth, body: form });
const upJson = up.ok ? await up.json() : { status: up.status, text: await up.text() };
await need('upload ok', up.ok && upJson.name, upJson);
const NAME = upJson.name;
const item = (upJson.images || []).find((i) => i.name === NAME) || {};
await check('listing gives a signed URL on the private route', /^\/api\/casora\/photo\/[^?]+\.jpg\?v=\d+&authSig=/.test(item.day || ''), item);

// (2) Without login or signature: refused. Old public addresses: gone.
const bare = (item.day || '').split('?')[0];
const status = async (u, h = {}) => (await fetch(BASE + u, { headers: h, redirect: 'manual' })).status;
await check('photo without login → 401', [401, 403].includes(await status(bare)), await status(bare));
await check('photo with ?v= but no signature → 401', [401, 403].includes(await status(bare + '?v=1')));
const sig = (item.day || '').split('authSig=')[1] || '';
await check('tampered signature → 401', [401, 403].includes(await status(bare + '?v=0&authSig=' + sig)));
await check('signature of another path → 401', [401, 403].includes(await status('/api/casora/photo/home-demo.jpg?' + (item.day || '').split('?')[1])));
await check('signed URL works without a header', (await status(item.day)) === 200);
await check('with login (Bearer) → 200', (await status(bare, auth)) === 200);
await check('not on /casora_assets/rooms', (await status(`/casora_assets/rooms/${NAME}.jpg`)) === 404);
await check('not on /local/casora/rooms', (await status(`/local/casora/rooms/${NAME}.jpg`)) === 404);
await check('shipped demo photo still public', (await status('/casora_assets/rooms/home-demo.jpg')) === 200);

// (3) Dashboard with the photo on the first room card.
const dash = await casoraDashboard((x) => x.url === 'qa-arbeit' || (x.config.views || []).some((v) => JSON.stringify(v).includes('"casora_room"')));
await need('Casora desktop dashboard with a room card', dash && dash.config.views);
const URL = 'qa-fotos';
const D = JSON.parse(JSON.stringify(dash.config));
let set = 0;
(function walk(x) {
  if (Array.isArray(x)) return x.forEach(walk);
  if (!x || typeof x !== 'object') return;
  if (!set && [].concat(x.template || []).includes('casora_room')) {
    // Saved the old way (address instead of name) – must still work.
    x.variables = { ...(x.variables || {}), image: `/local/casora/rooms/${NAME}.jpg`, image_night: NAME };
    set++;
    return;
  }
  Object.values(x).forEach(walk);
})(D.views[0]);
await need('room card on the first view', set === 1);
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
if (!list.some((x) => x.url_path === URL)) await c.cmd({ type: 'lovelace/dashboards/create', url_path: URL, title: 'QA Fotos', mode: 'storage', show_in_sidebar: false, require_admin: false });
await c.cmd({ type: 'lovelace/config/save', url_path: URL, config: D });
const signedWs = await c.cmd({ type: 'casora/photos' });
c.close();
atFinish(async () => {
  const c2 = await ws();
  const l2 = await c2.cmd({ type: 'lovelace/dashboards/list' });
  const x = l2.find((q) => q.url_path === URL);
  if (x) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: x.id });
  c2.close();
});
await check('casora/photos lists the photo signed', /authSig=/.test((signedWs.photos || {})[NAME] || '') && signedWs.expires_in >= 3600, signedWs);

const s = await open();
const pg = s.page;
await dashboard(pg, URL + '/' + (D.views[0].path || '0'), 3);
const hero = await stable(pg, (n) => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_room'))
  .map((b) => { const card = b.shadowRoot && b.shadowRoot.querySelector('ha-card'); return card ? card.style.getPropertyValue('--hero-img') : ''; })
  .find((v) => v.includes(n)) || '', NAME, { max: 20000, until: (v) => /authSig=/.test(v) });
await check('room card uses the signed URL', /url\("?\/api\/casora\/photo\/[^"]+authSig=/.test(hero), hero);
const loaded = await pg.evaluate((css) => new Promise((res) => {
  const m = /url\("?([^")]+)"?\)/.exec(css);
  if (!m) return res({ ok: false, why: 'no url' });
  const img = new Image();
  img.onload = () => res({ ok: img.naturalWidth > 0, w: img.naturalWidth });
  img.onerror = () => res({ ok: false, why: 'error' });
  img.src = m[1];
}), hero);
await check('photo loads in the browser (CSS/img, no header)', loaded.ok, loaded);
const plain = await pg.evaluate(async (u) => (await fetch(u, { credentials: 'omit' })).status, bare);
await check('in the browser without signature → 401', [401, 403].includes(plain), plain);

await finish();
