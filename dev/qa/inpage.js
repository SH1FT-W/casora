// Casora-QA: Helfer im Browser (per addInitScript in jede Seite geladen, vor HA).
// window.__qa: Shadow-DOM-Suche, Vorher/Nachher-Vergleich („tut der Tipp etwas?“),
// Prüfungen (abgeschnitten, Texte, doppelte Knöpfe, Seite scrollt quer) und die
// Schreibsperre: schreibende WebSocket-/REST-Aufrufe landen in einer Liste statt in HA.
(() => {
  if (window.__qa) return;
  const CFG = window.__QA_CFG || {};
  const blocked = [];
  const allowed = [];

  // ── Schreibsperre ─────────────────────────────────────────────────────
  // Nur UI-Helfer (aufgeklappte Reihe, Handy-Filter, Popup-Zustand) dürfen durch –
  // die ändern nichts am Haus, ohne sie klappt aber keine Badge auf.
  const UI_ENTITY = /^(input_select\.casora_(expanded_row|mobile_filter)|input_text\.casora_(thermostat_active_entity|actions_active_entity|now_playing_pinned)|input_boolean\.casora_(thermostat_overlay|actions_overlay|now_playing_minimized)|input_datetime\.casora_notifications_read)$/;
  const UI_SERVICE = /^(input_select\.select_option|input_select\.select_next|input_select\.select_previous|input_text\.set_value|input_boolean\.(turn_on|turn_off|toggle)|input_datetime\.set_datetime)$/;
  // Schreibend ist, was im letzten Pfadteil schreibt („…/save“, „…/delete“, „execute_script“ …);
  // Lesen („get_states“, „…/list“, „subscribe_…“) bleibt frei.
  const READ_OK = /^(frontend\/set_user_data|auth\/sign_path|render_template|subscribe_trigger|unsubscribe_events)$/;
  const WRITE_SEG = /(^|_)(call|execute|fire|save|create|update|delete|remove|set|write|install|restart|restore|apply|move|import|reset|clear|rename|upload|add|start|stop|reload|trigger|generate|confirm|approve|toggle|run|migrate|dismiss|ignore|skip|enable|disable|purge|assign|link|unlink|pair|remember|forget|send|publish|revert)(_|$)/;
  function uiOnly(domain, service, data) {
    if (!UI_SERVICE.test(domain + '.' + service)) return false;
    const t = data && (data.entity_id || (data.target && data.target.entity_id));
    const ids = [].concat(t || []);
    return ids.length > 0 && ids.every((id) => UI_ENTITY.test(String(id)));
  }
  function judge(msg) {
    if (!msg || typeof msg !== 'object' || CFG.allowWrites) return 'ok';
    const type = String(msg.type || '');
    if (type === 'call_service') {
      const data = Object.assign({}, msg.service_data || {}, msg.target ? { target: msg.target } : {});
      return uiOnly(msg.domain, msg.service, data) ? 'ui' : 'block';
    }
    if (READ_OK.test(type)) return 'ok';
    return WRITE_SEG.test(type.split('/').pop()) ? 'block' : 'ok';
  }
  function describeMsg(msg) {
    if (msg.type === 'call_service') {
      const t = (msg.service_data || {}).entity_id || ((msg.target || {}).entity_id) || '';
      return 'call_service ' + msg.domain + '.' + msg.service + (t ? ' ' + [].concat(t).join(',') : '');
    }
    return String(msg.type);
  }
  function patchConn(conn) {
    if (!conn || conn.__qaPatched) return;
    conn.__qaPatched = true;
    const smp = conn.sendMessagePromise.bind(conn);
    const sm = conn.sendMessage.bind(conn);
    conn.sendMessagePromise = function (msg) {
      const j = judge(msg);
      if (j === 'block') { blocked.push({ t: Date.now(), what: describeMsg(msg) }); return Promise.resolve(msg.type === 'call_service' ? { context: { id: 'qa-blocked' } } : null); }
      if (j === 'ui') allowed.push({ t: Date.now(), what: describeMsg(msg) });
      return smp(msg);
    };
    conn.sendMessage = function (msg, id) {
      if (judge(msg) === 'block') { blocked.push({ t: Date.now(), what: describeMsg(msg) }); return; }
      return sm(msg, id);
    };
  }
  const poll = setInterval(() => {
    const ha = document.querySelector('home-assistant');
    const conn = ha && ha.hass && ha.hass.connection;
    if (conn) { patchConn(conn); }
  }, 50);
  setTimeout(() => clearInterval(poll), 120000);
  // REST: POST auf /api/services/… und andere schreibende Aufrufe (Anmeldung bleibt frei).
  const ofetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (!CFG.allowWrites && method !== 'GET' && /\/api\//.test(url) && !/\/auth\//.test(url)) {
        const m = url.match(/\/api\/services\/([^/]+)\/([^/?]+)/);
        let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
        if (!(m && uiOnly(m[1], m[2], body))) {
          blocked.push({ t: Date.now(), what: method + ' ' + url.replace(location.origin, '') });
          return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      }
    } catch (e) { /* nie die Seite brechen */ }
    return ofetch.apply(this, arguments);
  };

  // ── DOM ───────────────────────────────────────────────────────────────
  function roots(start) {
    const out = [];
    (function walk(r) {
      out.push(r);
      const all = r.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) if (all[i].shadowRoot) walk(all[i].shadowRoot);
    })(start || document);
    return out;
  }
  function pierce(sel, start) {
    const out = [];
    roots(start).forEach((r) => r.querySelectorAll(sel).forEach((e) => out.push(e)));
    return out;
  }
  function parentOf(el) { return el.parentElement || (el.parentNode && el.parentNode.host) || null; }
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    // Unsichtbar, weil ein Vorfahr pointer-events:none + opacity:0 hat (Unter-Reihe zu).
    for (let p = el, n = 0; p && n < 30; p = parentOf(p), n++) {
      const cs = getComputedStyle(p);
      if (cs.opacity === '0' || cs.visibility === 'hidden') return false;
    }
    return true;
  }
  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  function label(el) {
    if (!el) return '';
    const a = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'));
    let t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t && el.shadowRoot) t = (el.shadowRoot.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t && el._config) t = String(el._config.name || el._config.entity || '');
    return (t || a || '').slice(0, 80);
  }
  function tplOf(el) {
    const c = el && el._config;
    if (!c) return '';
    return [].concat(c.template || []).join('+') || String(c.type || '');
  }
  function describe(el) {
    const parts = [];
    for (let p = el, n = 0; p && n < 6; p = parentOf(p), n++) {
      if (p === document.body || p === document.documentElement) break;
      let s = p.tagName.toLowerCase();
      if (p.id) s += '#' + p.id;
      const cls = typeof p.className === 'string' ? p.className.trim().split(/\s+/).filter((c) => c && !/^(on|open|active|sel|pvsel)$/.test(c)).slice(0, 2) : [];
      if (cls.length) s += '.' + cls.join('.');
      const t = tplOf(p);
      if (t) s += '(' + t.slice(0, 50) + ')';
      parts.unshift(s);
    }
    return parts.join(' > ');
  }
  let seq = 0;
  function tag(el) {
    if (!el.dataset.qa) el.dataset.qa = 'q' + (++seq);
    return el.dataset.qa;
  }
  function byTag(id) { return pierce('[data-qa="' + id + '"]')[0] || null; }

  // ── Vorher/Nachher: welche sichtbaren Elemente haben sich verändert? ────
  const ids = new WeakMap();
  let nid = 0;
  function snap() {
    const m = new Map();
    roots().forEach((r) => {
      const all = r.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        const rects = e.getClientRects();
        if (!rects.length) continue;
        const b = rects[0];
        if (b.width < 1 && b.height < 1) continue;
        let id = ids.get(e); if (!id) { id = ++nid; ids.set(e, id); }
        let own = '';
        for (let c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.data;
        const cs = getComputedStyle(e);
        m.set(id, [Math.round(b.x / 6), Math.round(b.y / 6), Math.round(b.width / 6), Math.round(b.height / 6),
          typeof e.className === 'string' ? e.className : '', own.trim().slice(0, 40), cs.opacity, cs.visibility,
          e.getAttribute('aria-expanded') || '', e.getAttribute('aria-checked') || '', e.getAttribute('aria-selected') || '',
          e.hasAttribute('open') ? 1 : 0].join('|'));
      }
    });
    return m;
  }
  let S0 = null, noise = new Set(), mark = { blocked: 0, allowed: 0, url: '' };
  async function before() {
    const a = snap();
    await new Promise((r) => setTimeout(r, 250));
    const b = snap();
    noise = new Set();
    a.forEach((v, k) => { if (b.get(k) !== v) noise.add(k); });
    b.forEach((v, k) => { if (!a.has(k)) noise.add(k); });
    S0 = b;
    mark = { blocked: blocked.length, allowed: allowed.length, url: location.href };
    return noise.size;
  }
  function after() {
    const b = snap();
    let changed = 0;
    if (S0) {
      S0.forEach((v, k) => { if (!noise.has(k) && b.get(k) !== v) changed++; });
      b.forEach((v, k) => { if (!noise.has(k) && !S0.has(k)) changed++; });
    }
    return {
      changed,
      blocked: blocked.slice(mark.blocked).map((x) => x.what),
      ui: allowed.slice(mark.allowed).map((x) => x.what),
      url: location.href !== mark.url ? location.href : '',
      dialog: dialogs().length,
    };
  }
  function dialogs() {
    const out = pierce('casora-popup').filter((e) => e.hasAttribute('open'));
    pierce('ha-more-info-dialog, dialog-edit-sidebar, ha-dialog-date-picker').forEach((e) => {
      const i = e.shadowRoot && e.shadowRoot.querySelector('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog');
      if (i && (i.open || i.hasAttribute('open'))) out.push(e);
    });
    pierce('ha-dialog[open], dialog[open], [role=dialog], [role=alertdialog], [role=menu], .flowin, .hmn-menu')
      .forEach((e) => { if (isVisible(e) && !out.includes(e)) out.push(e); });
    return out;
  }

  // ── Prüfungen ────────────────────────────────────────────────────────
  const CAROUSEL = /swipe|carousel|slide|track|marquee|ticker|swiper|mask|fade|glow|ring|progress|bar-fill|wave|bg|photo|hero|scrim/i;
  function isContent(e) {
    if (/^(BUTTON|A|INPUT|SELECT|BUTTON-CARD|HA-CARD|IMG|HA-ICON|HA-STATE-ICON)$/.test(e.tagName)) return true;
    if (e.getAttribute && (e.getAttribute('role') === 'button' || e.hasAttribute('data-mk'))) return true;
    for (let c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.data.trim()) return true;
    return false;
  }
  // Kinder im selben Baum + Shadow-Inhalt + eingesetzte Slots (begrenzt).
  function descendants(el, max) {
    const out = [];
    const q = [el];
    while (q.length && out.length < max) {
      const n = q.shift();
      const kids = [].concat(Array.from(n.children || []), n.shadowRoot ? Array.from(n.shadowRoot.children) : [],
        n.tagName === 'SLOT' && n.assignedElements ? n.assignedElements() : []);
      for (const k of kids) { out.push(k); q.push(k); }
    }
    return out;
  }
  // Liegt an der sichtbaren Mitte von el etwas anderes obenauf (tiefe Trefferprüfung durch
  // Shadow-DOMs)? Außerhalb des Fensters gilt nicht als verdeckt.
  function occluded(el, r) {
    const x = Math.max(r.left, 0) + (Math.min(r.right, innerWidth) - Math.max(r.left, 0)) / 2;
    const y = Math.max(r.top, 0) + (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    let h = document.elementFromPoint(x, y);
    for (let n = 0; h && h.shadowRoot && n < 30; n++) { const d = h.shadowRoot.elementFromPoint(x, y); if (!d || d === h) break; h = d; }
    if (!h) return false;
    for (let e = h, n = 0; e && n < 80; e = parentOf(e), n++) if (e === el) return false;
    // Treffer ist ein Vorfahr von el (el selbst ist z. B. pointer-events:none): nicht verdeckt.
    for (let e = el, n = 0; e && n < 80; e = parentOf(e), n++) if (e === h) return false;
    return true;
  }

  // Sichtbarer Inhalt eines Elements: Text (Range) bzw. Vereinigung der Kind-Elemente; ohne
  // beides null (dann gilt das Element selbst).
  function ink(d) {
    let L = Infinity, R = -Infinity;
    for (let c = d.firstChild; c; c = c.nextSibling) {
      let q = null;
      if (c.nodeType === 3 && c.data.trim()) { const rg = document.createRange(); rg.selectNodeContents(c); q = rg.getBoundingClientRect(); }
      else if (c.nodeType === 1) q = c.getBoundingClientRect();
      if (q && q.width > 0) { L = Math.min(L, q.left); R = Math.max(R, q.right); }
    }
    if (d.shadowRoot) for (const c of d.shadowRoot.children) { const q = c.getBoundingClientRect(); if (q.width > 0 && c.tagName !== 'STYLE') { L = Math.min(L, q.left); R = Math.max(R, q.right); } }
    return L < R ? { left: L, right: R } : null;
  }

  function overflowScan(scope) {
    const found = [];
    const pageScroll = [];
    const rows = [];
    const all = scope ? [scope].concat(descendants(scope, 20000)) : [];
    const list = scope ? all : (() => { const o = []; roots().forEach((r) => r.querySelectorAll('*').forEach((e) => o.push(e))); return o; })();
    for (const el of list) {
      if (!(el instanceof Element)) continue;
      const cw = el.clientWidth, sw = el.scrollWidth;
      if (!cw || sw <= cw + 2) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 8 || !isVisible(el)) continue;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        if (r.width >= innerWidth * 0.95 && /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) {
          pageScroll.push({ tag: tag(el), path: describe(el), sw, cw });
        } else if (!(cs.scrollbarWidth === 'none' && false)) {
          rows.push({ tag: tag(el), path: describe(el), sw, cw, label: label(el).slice(0, 60) });
        }
        continue;
      }
      if (ox !== 'hidden' && ox !== 'clip') continue;
      if (cs.textOverflow === 'ellipsis') continue;
      if (CAROUSEL.test(typeof el.className === 'string' ? el.className : '') || CAROUSEL.test(el.tagName)) continue;
      // Verdeckt (liegt z. B. unter einem offenen Popup): was man nicht sieht, kann nicht
      // sichtbar abgeschnitten sein.
      if (occluded(el, r)) continue;
      // Ganz links/rechts außerhalb des Fensters (hinausgeschobene Popup-Seite, Übergangs-Ebene):
      // unerreichbar und unsichtbar – quer scrollende Seiten meldet „seite-quer“.
      if (r.right <= 0 || r.left >= innerWidth) continue;
      // Gewollt abgeschnitten: Kante mit Verlaufsmaske (z. B. Raumleiste der Studio-Vorschau,
      // die zum offenen Raum rutscht) – nur als Hinweis melden.
      const mask = cs.maskImage || cs.webkitMaskImage || 'none';
      const masked = mask !== 'none';
      // Inhalt, der über den Rand hinausragt: angeschnitten (halb sichtbar) oder ganz draußen.
      let cut = 0, gone = 0; const names = [];
      for (const d of descendants(el, 400)) {
        if (!(d instanceof Element) || !isContent(d)) continue;
        const b = d.getBoundingClientRect();
        if (b.width < 4 || b.height < 4) continue;
        const dcs = getComputedStyle(d);
        if (dcs.position === 'fixed' || dcs.visibility === 'hidden' || dcs.opacity === '0') continue;
        // Unsichtbar über einen Vorfahren (visibility/opacity/content-visibility) → kein Befund.
        if (d.checkVisibility && !d.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        // Liegt zwischen el und d ein eigener Scroll- oder Clip-Container, gehört d zu dem:
        // eine Kachelreihe, die scrollt, wird als Reihe geprüft; ein innerer Clip-Container
        // hat seinen eigenen Befund. Sonst zählte jede Kachel einer scrollbaren Reihe hier doppelt.
        let inner = false;
        for (let a = parentOf(d), n = 0; a && a !== el && n < 40; a = parentOf(a), n++) {
          if (!(a instanceof Element)) continue;
          if (getComputedStyle(a).overflowX !== 'visible') {
            // Nur wenn der innere Container selbst ganz im Rahmen liegt – sonst schneidet el ihn ab.
            const ab = a.getBoundingClientRect();
            inner = ab.left >= r.left - 2 && ab.right <= r.right + 2;
            break;
          }
        }
        if (inner) continue;
        // Ragt über BEIDE Kanten hinaus (übergroßes Hintergrundfoto, Parallax-Rand): Kulisse,
        // kein abgeschnittener Inhalt.
        if (b.left < r.left - 2 && b.right > r.right + 2) continue;
        // Ganz hinausgeschoben per transform (z. B. Bestätigungsknopf .hui-cf, der erst nach dem
        // ersten Antippen hereinrutscht): gewollt versteckt, kein Abschneiden.
        const outside = b.left >= r.right - 1 || b.right <= r.left + 1;
        if (outside) {
          let slid = false;
          for (let a = d, n = 0; a && a !== el && n < 40; a = parentOf(a), n++) {
            if (a instanceof Element && getComputedStyle(a).transform !== 'none') { slid = true; break; }
          }
          if (slid) continue;
        }
        let straddle = (b.left < r.right - 2 && b.right > r.right + 2) || (b.right > r.left + 2 && b.left < r.left - 2);
        // Nur die „Tinte“ zählt: ein Griff/Knopf mit großer unsichtbarer Trefferfläche (z. B. der
        // Sortier-Griff ≡ am Rand einer Studio-Zeile) ragt hinaus, sein Symbol aber nicht.
        if (straddle) { const k = ink(d); if (k && k.left >= r.left - 1 && k.right <= r.right + 1) straddle = false; }
        // Mitten in einer Animation/Transition (Griff gleitet gerade herein/hinaus): Momentaufnahme.
        if (straddle || b.left >= r.right - 1 || b.right <= r.left + 1) {
          let moving = false;
          for (let a = d, n = 0; a && a !== el && n < 40; a = parentOf(a), n++) {
            if (a instanceof Element && a.getAnimations && a.getAnimations().some((x) => x.playState === 'running')) { moving = true; break; }
          }
          if (moving) continue;
        }
        const out = b.left >= r.right - 1 || b.right <= r.left + 1;
        if (straddle) { cut++; if (names.length < 4) names.push(label(d).slice(0, 30)); }
        else if (out && b.top < r.bottom && b.bottom > r.top) gone++;
      }
      if (cut || gone) found.push({ tag: tag(el), path: describe(el), sw, cw, cut, gone, names, masked, label: label(el).slice(0, 60),
        at: [r.left, r.top, r.width, r.height].map(Math.round).join(',') });
    }
    const de = document.scrollingElement || document.documentElement;
    if (de.scrollWidth > innerWidth + 1) pageScroll.push({ path: 'document', sw: de.scrollWidth, cw: innerWidth });
    return { cut: found, rows, pageScroll };
  }

  const EN = ['Show', 'Hide', 'Add', 'Remove', 'Delete', 'Save', 'Cancel', 'Close', 'Back', 'Next', 'Continue', 'Done', 'Edit',
    'Settings', 'Loading', 'Unknown', 'Unavailable', 'Room', 'Rooms', 'Tile', 'Tiles', 'Scene', 'Scenes', 'Light', 'Lights',
    'Open', 'Opened', 'Closed', 'Locked', 'Unlocked', 'Playing', 'Paused', 'Idle', 'None', 'Off', 'Today', 'Yesterday',
    'Tomorrow', 'minutes', 'hours', 'Preview', 'Night', 'More', 'Undo', 'Help', 'Search', 'Select', 'Selected', 'Choose',
    'Change', 'Changes', 'Apply', 'Reset', 'Rename', 'Living Room', 'Kitchen', 'Bedroom', 'Bathroom', 'Hallway', 'Office',
    'Garden', 'Temperature', 'Humidity', 'Battery', 'Power', 'Energy', 'Security', 'Camera', 'Cameras', 'Door', 'Window',
    'Weather', 'Everything', 'Nothing', 'Active', 'Inactive', 'Running', 'Stopped', 'Charging', 'Cleaning', 'Docked',
    'Heating', 'Cooling', 'Error', 'Failed', 'the', 'and', 'with', 'your', 'Your', 'you', 'You', 'this', 'This', 'not',
    "can't", "Couldn't", "don't", 'Coming soon', 'Tap to', 'Add a tile', 'Just now', 'ago', 'Never', 'Nobody', 'Away',
    'Home Assistant is', 'Setup', 'Sub-badges', 'expands'];
  const EN_RE = new RegExp('(?<![\\wÄÖÜäöüß-])(' + EN.map((w) => w.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')).join('|') + ')(?![\\wÄÖÜäöüß-])');
  const RAW_STATE = /^(Unavailable|Unknown|Jammed|Jamming|Locked|Unlocked|Locking|Unlocking|Opening|Closing|Open|Opened|Closed|Playing|Paused|Idle|Standby|Buffering|On|Off|Not home|Away|Heating|Cooling|Docked|Cleaning|Returning|Charging|Discharging|Armed away|Armed home|Disarmed|Triggered|Problem|Detected|Clear|Wet|Dry)$/;
  const ENTITY_RE = /(?<![\w/.])(light|switch|sensor|binary_sensor|scene|script|input_[a-z]+|climate|cover|lock|media_player|camera|vacuum|fan|automation|person|weather|button|select|number|alarm_control_panel|update|calendar|todo)\.[a-z0-9_]{3,}(?![\w/])/;
  const SKIP_TEXT = 'input, textarea, select, code, pre, ha-code-editor, ha-entity-picker, ha-combo-box, ha-selector, [data-no-i18n], .mono, [data-entity], script, style, noscript, .kbd, .qa-ignore';
  function textScan() {
    const hits = [];
    const seen = new Set();
    roots().forEach((r) => {
      const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const s = n.data.replace(/\s+/g, ' ').trim();
        if (!s || s.length > 400) continue;
        const p = n.parentElement;
        if (!p || !isVisibleCheap(p)) continue;
        let skipEn = false, skipAll = false;
        for (let a = p, k = 0; a && k < 12; a = parentOf(a), k++) {
          if (a.matches && a.matches('input, textarea, select, code, pre, ha-code-editor, script, style, .qa-ignore')) { skipAll = true; break; }
          if (a.matches && a.matches(SKIP_TEXT)) skipEn = true;
        }
        if (skipAll) continue;
        const add = (sev, kind, text) => { const key = kind + '|' + text; if (seen.has(key)) return; seen.add(key); hits.push({ sev, kind, text: text.slice(0, 120), path: describe(p), tag: tag(p) }); };
        if (/(^|[^\w])(undefined|NaN)([^\w]|$)|\[object Object\]/.test(s)) add('error', 'text-kaputt', s);
        else if (/(^|[^\w])null([^\w]|$)/.test(s)) add('warn', 'text-null', s);
        if (!skipEn) {
          // Eine Zeile, die nur aus der Entitäts-ID besteht (Untertitel in Geräte-Listen), ist
          // gewollt technisch → Hinweis. Eine ID mitten im Satz ist ein Übersetzungs-/Namensfehler.
          if (ENTITY_RE.test(s)) add(new RegExp('^' + ENTITY_RE.source + '$').test(s) ? 'info' : 'warn', 'text-entity-id', s);
          // Ein ganzer Text, der nur ein roher englischer HA-Zustand ist („Unavailable“,
          // „Jammed“ …), ist ein sichtbarer Übersetzungsfehler → error; sonst Verdacht → warn.
          if (RAW_STATE.test(s)) add('error', 'text-englisch', s + '  [roher Zustand]');
          else { const m = s.match(EN_RE); if (m) add('warn', 'text-englisch', s + '  [' + m[1] + ']'); }
        }
      }
    });
    return hits;
  }
  function isVisibleCheap(el) {
    const r = el.getClientRects();
    if (!r.length || (r[0].width < 1 && r[0].height < 1)) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return true;
  }
  function dupScan() {
    const count = new Map();
    pierce('button, [role=button], ha-button, mwc-button, a.button, .fbtn').forEach((b) => {
      if (!isVisible(b)) return;
      const t = (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length < 12 && !/\s/.test(t)) return;
      if (t.length > 60) return;
      count.set(t, (count.get(t) || 0) + 1);
    });
    return [...count].filter(([, n]) => n > 1).map(([t, n]) => ({ text: t, n }));
  }

  // Beim Aufräumen: UI-Helfer (nur die erlaubten) direkt setzen.
  async function uiSet(entity, value) {
    const ha = document.querySelector('home-assistant');
    const h = ha && ha.hass;
    if (!h || !UI_ENTITY.test(entity)) return false;
    const [d] = entity.split('.');
    const st = h.states[entity];
    if (!st || st.state === value) return !!st;
    if (d === 'input_select') await h.callService('input_select', 'select_option', { entity_id: entity, option: value });
    else if (d === 'input_boolean') await h.callService('input_boolean', value === 'on' ? 'turn_on' : 'turn_off', { entity_id: entity });
    else if (d === 'input_text') await h.callService('input_text', 'set_value', { entity_id: entity, value });
    return true;
  }
  function uiStates() {
    const h = document.querySelector('home-assistant')?.hass;
    const out = {};
    if (!h) return out;
    Object.keys(h.states).forEach((id) => { if (UI_ENTITY.test(id) && !/notifications_read/.test(id)) out[id] = h.states[id].state; });
    return out;
  }

  window.__qa = { pierce, roots, isVisible, inViewport, label, describe, tag, byTag, tplOf, parentOf, before, after,
    dialogs, overflowScan, textScan, dupScan, blocked, allowed, uiSet, uiStates, patchConn, judge };
})();
