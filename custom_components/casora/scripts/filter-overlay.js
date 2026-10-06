// filter-overlay.js
(function () {
  'use strict';
  if (customElements.get('casora-filter-overlay')) return;

  const CASORA_VARS = [
    '--casora-entity-height-current','--casora-entity-inner-pad-current',
    '--casora-entity-icon-size-current','--casora-entity-name-font-current',
    '--casora-entity-state-font-current','--casora-entity-col-width-current',
    '--casora-entity-rows-current','--casora-entity-justify-current',
    '--casora-entity-right-inset-current','--casora-entity-left-inset-current',
    '--casora-entity-shadow-pad-right-current','--casora-entity-overflow-y-current',
    '--casora-button-card-box-shadow-current','--casora-button-card-box-shadow-active-current',
    '--casora-button-card-box-shadow-hover-current','--casora-rail-left','--page-gutter',
    '--badge-gap-current','--badge-col-gap-current','--badge-padding-current',
    '--badge-min-height-current','--badge-icon-size-current','--badge-font-size-current',
    '--badge-btn-size-current','--badge-media-icon-size-current',
    '--badge-media-btn-size-current','--badge-media-btn-icon-size-current',
    '--casora-entity-background','--casora-entity-background-active',
    '--casora-entity-active-tint','--casora-entity-active-tint-mobile',
    '--casora-entity-hover-tint',
    '--casora-entity-name','--casora-entity-name-active',
    '--casora-entity-state','--casora-entity-state-opacity','--casora-entity-state-active',
    '--casora-entity-state-active-color','--ha-card-border-radius',
    '--ha-card-background','--button-card-box-shadow','--button-card-box-shadow-active',
    '--button-card-box-shadow-mobile','--button-card-box-shadow-active-mobile',
    '--casora-progress-color','--casora-progress-track',
    '--hero-room-name-size-current',
  ];

  const SPRING_IN = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_OUT  = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  // casora-local-patch: Raumfotos für die Raum-Ansicht (Basisname in www/casora/rooms/<name>.jpg, + "-night").
  const ROOM_PHOTOS = {
    'Wohnzimmer': 'wohnzimmer', 'Küche': 'kuche', 'Büro': 'buro', 'Schlafzimmer': 'schlafzimmer',
    'Bad': 'badezimmer', 'Badezimmer': 'badezimmer', 'Flur': 'flur', 'HWR': 'hwr', 'Waschküche': 'hwr',
    'Terrasse': 'terrasse',
  };
  const TITLE_VCENTER = 0.45;

  const LANDSCAPE_PHONE_VAR = '--casora-landscape-phone'; // '0' or '1', flipped by @media
  if (!document.getElementById('casora-landscape-phone-style')) {
    const s = document.createElement('style');
    s.id = 'casora-landscape-phone-style';
    s.textContent =
      `:root{${LANDSCAPE_PHONE_VAR}:0;}` +
      `@media (max-height:600px) and (orientation:landscape){:root{${LANDSCAPE_PHONE_VAR}:1;}}`;
    document.head.appendChild(s);
  }
  const LANDSCAPE_GUTTER_CALC = `calc(60px * var(${LANDSCAPE_PHONE_VAR}, 0))`;

  const isLandscapePhone = () => {
    try {
      return (getComputedStyle(document.documentElement)
        .getPropertyValue(LANDSCAPE_PHONE_VAR) || '').trim() === '1';
    } catch (_) { return false; }
  };

  const NP_LATE_DEAD_ZONE  = 1.25;
  const COMPACT_BAR_HEIGHT = 44; // compact nav title content height, below the safe-area inset
  const BADGE_LOCK_GAP     = 6;  // gap between compact bar bottom and the pinned badge row
  const BADGE_INACTIVE_BG  = 'rgba(46,48,56,0.78)';

  window._casoraFilterOverlayBuild = '2026-08-20-np-order';

  let _movedBadgeRow = null; // { owner, wrapper, el, parent, sibling }
  let _pinnedPill = null;
  let _npTraceTarget = null;

  window._casoraNpTrace = function (ms) {
    const w = _npTraceTarget;
    if (!w) { console.log('np-trace: open the Media popup once first'); return; }
    const t0 = performance.now(), out = [];
    let last = null, frame = 0;
    const tick = () => {
      const top = w.getBoundingClientRect().top;
      const mt  = w.style.getPropertyValue('margin-top') || '-';
      const key = top.toFixed(2) + '|' + mt;
      if (key !== last) {
        out.push('f' + frame + ' +' + (performance.now() - t0).toFixed(0) +
                 'ms top=' + top.toFixed(2) + ' mt=' + mt);
        last = key;
      }
      frame++;
      if (performance.now() - t0 < (ms || 2500)) requestAnimationFrame(tick);
      else console.log('np-trace (' + window._casoraFilterOverlayBuild + ')\n' + out.join('\n'));
    };
    requestAnimationFrame(tick);
  };
  // Zwei Marken: eine ausgeschaltete Kachel trägt dataset.off, eine show_when-Kachel ohne Inhalt
  // dataset.showWhen (bzw. ihre Karte ist hidden). Beim Schließen des Filters solche Wrapper nicht
  // wieder einblenden – die Reihe blendet sie einen Moment später erneut aus, der Abschnitt wächst
  // und alles darunter rutscht (Hemma 2.2.0, MIT).
  // Favoriten-Kopf: Merkmal variables.favorites (am Handy umbenennbar), sonst der Standardname.
  function _isFavHeader(cfg) {
    const v = (cfg && cfg.variables) || {};
    if (v.favorites === true) return true;
    return v.favorites !== false && ['Favorites', 'Favoriten'].includes(String((cfg && cfg.name) || '').trim());
  }

  function _restorable(el) {
    const d = el && el.dataset;
    if (!d || d.off === '1' || d.showWhen === '1') return false;
    const card = el.firstElementChild;
    return !(card && (card.hidden || card.style.display === 'none'));
  }
  let _badgeNaturalTop = null;

  function _measureBadgeNaturalTop(badgeEl) {
    if (!badgeEl) return _badgeNaturalTop;
    const se = _dashHeader?.scrollEl;
    const dashScroll = se ? (se === window ? (window.scrollY || 0) : (se.scrollTop || 0)) : 0;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (_badgeNaturalTop && (_badgeNaturalTop.vw !== vw || _badgeNaturalTop.vh !== vh)) {
      _badgeNaturalTop = null;
    }
    if (dashScroll <= 1) {
      const card = badgeEl.shadowRoot?.querySelector('ha-card') || badgeEl;
      const rect = card.getBoundingClientRect();
      if (rect.height > 4) _badgeNaturalTop = { top: rect.top, vw, vh };
    }
    return _badgeNaturalTop;
  }

  function _alignAdoptedBadgeRow(badgeW, badgeEl, natural, maxShift = 12, dead = 0.1) {
    if (!badgeW || !badgeEl || !natural) return;
    const card  = badgeEl.shadowRoot?.querySelector('ha-card') || badgeEl;
    const rect  = card.getBoundingClientRect();
    if (!rect.height) return;
    _alignAdoptedEl(badgeW, natural.top, maxShift, dead, rect.top);
  }

  // Same fold against a wrapper's own top edge, for Now Playing.
  function _alignAdoptedEl(w, naturalTop, maxShift = 12, dead = 0.05, measuredTop) {
    if (!w || naturalTop == null) return 0;
    const top = measuredTop != null ? measuredTop : w.getBoundingClientRect().top;
    const shift = naturalTop - top;
    if (Math.abs(shift) <= dead || Math.abs(shift) > maxShift) return 0;
    const cur = parseFloat(w.style.getPropertyValue('margin-top')) || 0;
    w.style.setProperty('margin-top', `${(cur + shift).toFixed(2)}px`, 'important');
    return shift;
  }

  // button-card renders on lit's microtask, after this callback.
  function _flushRender(el) {
    try {
      if (el && typeof el.performUpdate === 'function') el.performUpdate();
    } catch (_) {}
  }
  // iOS decides a pan gesture's fate at touchstart; don't mutate layout there.
  let _touchActive = false;
  document.addEventListener('touchstart', () => { _touchActive = true; },  { passive: true, capture: true });
  document.addEventListener('touchend',   (e) => { _touchActive = e.touches.length > 0; }, { passive: true, capture: true });
  document.addEventListener('touchcancel',(e) => { _touchActive = e.touches.length > 0; }, { passive: true, capture: true });
  let _activeOverlay = null;

  function _findChromePill(root) {
    const walk = (node, depth) => {
      if (!node || depth > 16 || !node.querySelectorAll) return null;
      for (const el of node.querySelectorAll('button-card')) {
        const t = el._config?.template;
        const list = Array.isArray(t) ? t : (t ? [t] : []);
        if (list.includes('casora_mobile_chrome')) return el;
      }
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const hit = walk(el.shadowRoot, depth + 1);
          if (hit) return hit;
        }
      }
      return null;
    };
    return walk(root, 0);
  }

  function _pinChromePill(host, searchRoot) {
    const el = _findChromePill(searchRoot);
    if (!el || el.parentNode === host) return;
    const parent = el.parentNode;
    if (!_pinnedPill) {
      _pinnedPill = { host, parent, sibling: el.nextSibling, obs: null };
      const obs = new MutationObserver(() => {
        if (_pinnedPill && _pinnedPill.host.isConnected) {
          requestAnimationFrame(() => _pinChromePill(host, searchRoot));
        }
      });
      try { obs.observe(parent, { childList: true }); } catch (_) {}
      _pinnedPill.obs = obs;
    }
    host.querySelectorAll('button-card').forEach((c) => { if (c !== el) c.remove(); });
    host.insertBefore(el, host.firstChild);
    // No per-button highlight: the capsule answers the tap as one shape.
    el.style.setProperty('--casora-chrome-fill-hover', 'transparent');
    el.style.setProperty('--ha-ripple-pressed-color', 'transparent');
    el.style.setProperty('--ha-ripple-hover-color', 'transparent');
  }

  function _hideChromePill() {
    const host = _pinnedPill?.host;
    if (!host) return;
    host.style.transition = 'opacity 200ms ease-out, filter 200ms ease-out';
    host.style.filter = 'blur(8px)';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
  }

  function _showChromePill() {
    const host = _pinnedPill?.host;
    if (!host) return;
    host.style.transition = 'none';
    host.style.transformOrigin = '50% 30%';
    host.style.transform = 'scale(0.93) translateY(20px)';
    host.style.opacity = '0';
    host.style.filter = 'blur(8px)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (_activeOverlay) return;
      host.style.transition = `transform 0.62s ${SPRING_IN},`
        + ` opacity 0.50s ${EASE_OUT}, filter 0.40s ${EASE_OUT}`;
      host.style.transform = 'scale(1) translateY(0px)';
      host.style.opacity = '1';
      host.style.filter = 'blur(0px)';
      host.style.pointerEvents = 'auto';
      // filter and transform have to GO, not settle at a no-op value.
      setTimeout(() => {
        if (_activeOverlay) return;
        host.style.removeProperty('transition');
        host.style.removeProperty('transform');
        host.style.removeProperty('transform-origin');
        host.style.removeProperty('filter');
      }, 700);
    }));
  }

  function _unpinChromePill() {
    const m = _pinnedPill;
    if (!m) return;
    _pinnedPill = null;
    try { m.obs?.disconnect(); } catch (_) {}
    const el = m.host.querySelector('button-card');
    if (el && m.parent?.isConnected) m.parent.insertBefore(el, m.sibling);
    m.host.remove();
  }

  function _restoreBadgeRow() {
    const m = _movedBadgeRow;
    if (!m) return;
    _movedBadgeRow = null;
    const { wrapper, el, parent, sibling } = m;
    wrapper.style.removeProperty('position');
    wrapper.style.removeProperty('top');
    wrapper.style.removeProperty('left');
    wrapper.style.removeProperty('right');
    wrapper.style.removeProperty('width');
    wrapper.style.removeProperty('height');
    wrapper.style.removeProperty('z-index');
    wrapper.style.removeProperty('margin-top');
    wrapper.style.removeProperty('--ha-card-backdrop-filter');
    wrapper.style.removeProperty('padding-left');
    el.style.removeProperty('position'); // lets the stylesheet's sticky return
    el.style.removeProperty('top');
    el.style.removeProperty('left');
    el.style.removeProperty('right');
    el.style.removeProperty('width');
    el.style.removeProperty('z-index');
    el.style.removeProperty('--ha-card-backdrop-filter');
    // DOM moves reset descendant scroll positions - preserve the pills' scroll.
    const scroller = el.shadowRoot?.querySelector('#badges');
    const keepSL   = scroller ? scroller.scrollLeft : 0;
    if (parent) {
      if (sibling && sibling.parentNode === parent) parent.insertBefore(wrapper, sibling);
      else parent.appendChild(wrapper);
    }
    if (scroller && keepSL) scroller.scrollLeft = keepSL;
  }

  // ── Main-dashboard collapsing header ───────────────────────────────────────
  const DASH_BAR_HEIGHT = 44;
  let _dashHeader = null; // { grad, title, scrollEl, onScroll, update, hide, inst }
  let _dashBarOn  = false; // frosted bar visible (hysteresis state)
  let _dashTitleStyle = null;

  // The dashboard scrolls in an inner shadow-DOM container; scroll doesn't cross it.
  function _findScrollAncestor(el) {
    let node = el;
    for (let i = 0; node && i < 40; i++) {
      if (node.nodeType === 1) {
        try {
          const cs = getComputedStyle(node);
          if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
              node.scrollHeight > node.clientHeight + 40) return node;
        } catch (_) {}
      }
      node = node.parentNode || node.host || null;
    }
    return null;
  }

  let _bgCardCache = null;
  function _findBgCard() {
    if (_bgCardCache?.isConnected) return _bgCardCache;
    _bgCardCache = null;
    const walk = (root, depth) => {
      if (!root || depth > 15) return null;
      let cards;
      try { cards = root.querySelectorAll('button-card'); } catch (_) { return null; }
      for (const bc of cards) {
        const t = bc._config?.template;
        if (t !== 'casora_mobile_bg' && !(Array.isArray(t) && t.includes('casora_mobile_bg'))) continue;
        const inner = bc.shadowRoot?.querySelector('ha-card');
        if (!inner) continue;
        const acs = getComputedStyle(inner, '::after');
        if (acs.backgroundImage && acs.backgroundImage.includes('url(')) return inner;
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const found = walk(el.shadowRoot, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };
    _bgCardCache = walk(document, 0);
    return _bgCardCache;
  }

  const EMPTY_SET = new Set();
  const activeStates     = () => window.CASORA_ACTIVE_STATES || EMPTY_SET;
  const filterCategories = () => window.CASORA_FILTER_CATEGORIES || {};

  function _cardCategory(cfg) {
    const direct = cfg?.variables?.mobile_filter_category;
    if (direct !== null && direct !== undefined) return direct;
    const t = cfg?.template;
    const cats = filterCategories();
    for (const n of (Array.isArray(t) ? t : [t])) {
      if (n && Object.prototype.hasOwnProperty.call(cats, n)) return cats[n];
    }
    return null;
  }

  // ── Raum-Kategorien (04.10.2026) ──────────────────────────────────────────────────────────────
  // Handy-Raumseite nach Kategorien gruppiert wie Apples Home-App (iOS 18): kleine, ruhige
  // Überschrift je Gruppe, darunter das Zweierraster. Reihenfolge der Gruppen folgt Casoras
  // Kachelregel (Beleuchtung → Heizung/FBH → Luftreiniger → Jalousie → … → Medien → Pflanzen) statt
  // Apples „Klima zuerst“. Jalousien sind kein Klima-Gerät (wie in den Badge-Filtern): eigene Gruppe
  // „Jalousien“ nach Klima (06.10.2026); Garagen- und Hoftore zählen zu Sicherheit.
  // Innerhalb einer Gruppe bleibt die Studio-Reihenfolge.
  // Standard an. Schalter: Studio → Design & Bedienung → Handy (room_groups, setzt über
  // casora_mobile_bg --casora-room-groups: off), Raumseiten-Option group_by_category (true/false),
  // je Gerät überschreibbar per localStorage 'casora-room-groups' (on | off).
  const ROOM_GROUP_ORDER = ['lights', 'climate', 'covers', 'security', 'media', 'water', 'other'];
  const ROOM_GROUP_LABEL = {
    lights: 'Licht', climate: 'Klima', covers: 'Jalousien', security: 'Sicherheit',
    media: 'Lautsprecher und TVs', water: 'Wasser', other: 'Sonstiges',
  };
  // Räume mit weniger Kacheln bleiben ungruppiert (Überschriften wären mehr als Inhalt).
  const ROOM_GROUP_MIN_TILES = 4;
  const ROOM_GROUP_BY_TEMPLATE = {
    casora_light: 'lights',
    casora_thermostat: 'climate', casora_air_purifier: 'climate', casora_air_device: 'climate',
    casora_fan: 'climate', casora_humidifier: 'climate', casora_vent: 'climate', casora_cover: 'covers',
    casora_lock: 'security', casora_alarm: 'security', casora_camera: 'security', casora_cameras: 'security',
    casora_doorbell: 'security', casora_motion: 'security',
    casora_media: 'media', casora_game: 'media',
  };
  const ROOM_GROUP_BY_DOMAIN = {
    light: 'lights',
    climate: 'climate', fan: 'climate', humidifier: 'climate', cover: 'covers',
    lock: 'security', alarm_control_panel: 'security', camera: 'security',
    media_player: 'media', remote: 'media',
    valve: 'water', water_heater: 'water',
  };
  function _roomGroupOf(cfg, depth = 0) {
    // Hüllen ohne eigenes Gerät (Swipe-Stapel, bedingte Karte): Kategorie der ersten inneren
    // Karte, sonst Sonstiges. Vorher landete ein Thermostat-Stapel immer ganz unten in Sonstiges.
    if (cfg && !cfg.template && !cfg.entity && depth < 4) {
      const inner = cfg.card || (Array.isArray(cfg.cards) ? cfg.cards.find(Boolean) : null);
      if (inner && typeof inner === 'object') return _roomGroupOf(inner, depth + 1);
    }
    const t = cfg?.template;
    const ent = String(cfg?.entity || '');
    const dom = ent.split('.')[0];
    // Garagen-/Hoftor (cover mit device_class garage/gate) gehört zu Sicherheit, nicht zu Jalousien.
    if (dom === 'cover') {
      let dc = '';
      try { dc = document.querySelector('home-assistant')?.hass?.states?.[ent]?.attributes?.device_class || ''; } catch (_) {}
      if (dc === 'garage' || dc === 'gate') return 'security';
    }
    for (const n of (Array.isArray(t) ? t : [t])) {
      if (n && ROOM_GROUP_BY_TEMPLATE[n]) return ROOM_GROUP_BY_TEMPLATE[n];
    }
    if (/bewaesser|bewässer|irrigation|sprinkler|garden_water|gartenwasser/i.test(ent)) return 'water';
    if (dom === 'binary_sensor' && /door|window|tuer|tür|fenster|kontakt|contact/i.test(ent)) return 'security';
    return ROOM_GROUP_BY_DOMAIN[dom] || 'other';
  }
  function _roomGroupOn(cfg) {
    let v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue('--casora-room-groups').trim(); } catch (_) {}
    if (cfg?.group_by_category === true) v = 'on';
    if (cfg?.group_by_category === false) v = 'off';
    try { const ls = localStorage.getItem('casora-room-groups'); if (ls) v = ls; } catch (_) {}
    return v !== 'off' && v !== 'false';
  }
  // Kacheln eines Raums in Gruppen teilen: [{ key, cards }] in ROOM_GROUP_ORDER, oder null, wenn
  // der Raum flach bleibt (zu wenige Kacheln oder nur eine Kategorie).
  function _roomGroupSplit(cards) {
    if (!Array.isArray(cards) || cards.length < ROOM_GROUP_MIN_TILES) return null;
    const buckets = new Map();
    for (const c of cards) {
      const key = _roomGroupOf(c);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    }
    if (buckets.size < 2) return null;
    return ROOM_GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => ({ key: k, cards: buckets.get(k) }));
  }
  // Überschrift einer Gruppe in der Sprache des Dashboards.
  function _roomGroupHeading(key) {
    const label = ROOM_GROUP_LABEL[key] || key;
    const shown = window.casoraTr ? window.casoraTr(label) : label;
    // „Licht“ heißt sonst überall „Light“; als Gruppe schreibt Apple „Lights“ (04.10.2026).
    return (key === 'lights' && shown === 'Light') ? 'Lights' : shown;
  }
  // Dieselbe Zuordnung für die Handy-Vorschau im Studio (casora-panel.js).
  window.casoraRoomGroups = {
    order: ROOM_GROUP_ORDER, label: ROOM_GROUP_LABEL, minTiles: ROOM_GROUP_MIN_TILES,
    of: _roomGroupOf, split: _roomGroupSplit, heading: _roomGroupHeading,
  };

  const H_SCROLL_IDS = new Set(['media_row', 'climate_row', 'rooms_row']);

  // #8: Unschärfe des Raumfotos (Studio: Design & Bedienung → Mobil; casora_mobile_bg setzt die
  // Variable). Standard 28 px wie bisher; der Schleier beim Scrollen skaliert mit (28 → 44 px).
  const ROOM_PHOTO_BLUR = 'var(--casora-room-photo-blur, 28px)';
  const ROOM_VEIL_BLUR  = `calc(${ROOM_PHOTO_BLUR} * 11 / 7)`;

  const _blurLayers = new Set();
  const _otherBlurUp = (ownBlurEl) => {
    for (const el of _blurLayers) {
      if (el === ownBlurEl || !el.isConnected) continue;
      if (el.style.display === 'none') continue;
      if (parseFloat(getComputedStyle(el).opacity || '0') > 0.05) return true;
    }
    return false;
  };

  const _rowContentRight = (row) => {
    const rowRect = row.getBoundingClientRect();
    const limit = rowRect.left + Math.max(4096, row.clientWidth * 6);
    let right = rowRect.right;
    const walk = (node, depth) => {
      if (depth > 8 || !(node instanceof Element)) return;
      const r = node.getBoundingClientRect();
      if (r.width > 0.5 && r.right <= limit && r.right > right) right = r.right;
      if (node.shadowRoot) for (const c of node.shadowRoot.children) walk(c, depth + 1);
      for (const c of node.children) walk(c, depth + 1);
    };
    walk(row.firstElementChild, 0);
    return right;
  };

  function _fixRowWidth(row) {
    const inner = row.firstElementChild;
    if (!inner) return;
    const cap = Math.max(4096, row.clientWidth * 6);
    // Undo a width left over from a pre-clamp measurement.
    const curW = parseFloat(inner.style.getPropertyValue('width')) || 0;
    if (curW > cap) inner.style.removeProperty('width');
    const ext = _rowContentRight(row) - inner.getBoundingClientRect().left;
    if (ext > row.clientWidth + 4 && ext <= cap &&
        Math.abs(ext - inner.getBoundingClientRect().width) > 4) {
      // Needs !important: the template's own max-content rule beats a plain rule.
      inner.style.setProperty('width', `${Math.ceil(ext)}px`, 'important');
    }
  }
  function _fixRowWidths(root) {
    const walk = (node, depth) => {
      if (depth > 12 || !(node instanceof Element)) return;
      if (H_SCROLL_IDS.has(node.id)) _fixRowWidth(node);
      if (node.shadowRoot) for (const c of node.shadowRoot.children) walk(c, depth + 1);
      for (const c of node.children) walk(c, depth + 1);
    };
    if (root instanceof Element) walk(root, 0);
  }

  (function attachRowScrollFix() {
    let row = null, inner = null, maxPan = 0, panStart = 0;
    let useNative = true, startX = 0, startY = 0;
    let decided = false, horizontal = false;
    let lastX = 0, lastT = 0, vel = 0, momentumRaf = 0;
    const getPan = () => useNative ? row?.scrollLeft ?? 0 : (row?._casoraPanX || 0);
    const setPan = (el, innerEl, native, v) => {
      v = Math.max(0, Math.min(maxPan, v));
      if (native) el.scrollLeft = v;
      else if (innerEl) { el._casoraPanX = v; innerEl.style.transform = `translateX(${-v}px)`; }
      return v;
    };
    document.addEventListener('touchstart', (e) => {
      cancelAnimationFrame(momentumRaf);
      row = null; decided = horizontal = false;
      const t = e.touches[0];
      if (!t) return;
      let hit = null;
      for (const el of e.composedPath()) {
        if (el instanceof Element && H_SCROLL_IDS.has(el.id)) { hit = el; break; }
      }
      if (!hit) return;
      inner = hit.firstElementChild;
      if (hit.scrollWidth > hit.clientWidth + 4) {
        useNative = true;
        maxPan = hit.scrollWidth - hit.clientWidth;
      } else if (inner) {
        // Content only paints past the row, so pan by transform. Non-iOS only.
        const cur = hit._casoraPanX || 0;
        maxPan = Math.round(_rowContentRight(hit) + cur - hit.getBoundingClientRect().right);
        useNative = false;
      } else {
        return;
      }
      if (maxPan < 5) return;
      row = hit;
      panStart = getPan();
      startX = lastX = t.clientX;
      startY = t.clientY;
      lastT = e.timeStamp;
      vel = 0;
    }, { passive: true, capture: true });
    document.addEventListener('touchcancel', () => {
      row = null;
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', (e) => {
      if (!row) return;
      const t = e.touches[0];
      if (!t) return;
      if (!decided) {
        const dx = Math.abs(t.clientX - startX), dy = Math.abs(t.clientY - startY);
        if (dx < 2 && dy < 2) return;      // taps never reach preventDefault
        decided = true;
        horizontal = dx >= dy;
      }
      if (!horizontal) { row = null; return; }
      setPan(row, inner, useNative, panStart + (startX - t.clientX));
      const dt = Math.max(1, e.timeStamp - lastT);
      vel = (lastX - t.clientX) / dt;      // px per ms
      lastX = t.clientX;
      lastT = e.timeStamp;
      if (e.cancelable) e.preventDefault(); // keep the page from scrolling vertically
    }, { passive: false, capture: true });
    document.addEventListener('touchend', () => {
      if (!row || !horizontal) {
        // Re-fit only after the touch, never while iOS is arbitrating a pan.
        if (row) { const r = row; setTimeout(() => { if (!_touchActive) _fixRowWidth(r); }, 80); }
        row = null;
        return;
      }
      const el = row, innerEl = inner, native = useNative, max = maxPan;
      row = null;
      setTimeout(() => { if (!_touchActive) _fixRowWidth(el); }, 80);
      let v = vel * 16;                    // px per frame
      let pos = native ? el.scrollLeft : (el._casoraPanX || 0);
      const glide = () => {
        if (Math.abs(v) < 0.5) return;
        pos = Math.max(0, Math.min(max, pos + v));
        if (native) el.scrollLeft = pos;
        else if (innerEl) { el._casoraPanX = pos; innerEl.style.transform = `translateX(${-pos}px)`; }
        if (pos <= 0 || pos >= max) return;
        v *= 0.94;
        momentumRaf = requestAnimationFrame(glide);
      };
      momentumRaf = requestAnimationFrame(glide);
    }, { passive: true, capture: true });
  })();

  function _ensureDashboardHeader(inst) {
    if (_dashHeader?.grad?.isConnected) return;
    if (_dashHeader) {
      // The view was torn down; detach the stale listener before rebuilding.
      try {
        _dashHeader.scrollEl?.removeEventListener('scroll', _dashHeader.onScroll);
        document.removeEventListener('touchmove', _dashHeader.onScroll, true);
      } catch (_) {}
      _dashHeader.grad?.remove();
      _dashHeader.veil?.remove();
      _dashHeader.edge?.remove();
      _dashHeader.title?.remove();
      _unpinChromePill();
      _dashHeader = null;
    }
    const target = inst._appendTarget;
    if (!target || !inst._headerEl) return;

    // The filter entity is global, so a popup left open elsewhere would leak into this one.
    if (inst._hass?.states?.['input_select.casora_mobile_filter']?.state !== 'all') {
      try {
        if (window._casoraFilter) {
          window._casoraFilter.set('all');
          window._casoraFilter.share(inst._rawHass || inst._hass, 'all');
        } else inst._hass.callService('input_select', 'select_option', {
          entity_id: 'input_select.casora_mobile_filter',
          option: 'all',
        });
      } catch (_) {}
    }
    // Studio "Open dashboard" from a room: open that room once the page stands
    // (casora-panel _openDash leaves its filter key here, for this tab only).
    let wantRoom = null;
    // casora-local-patch (03.10.2026): Nicht in der Studio-Vorschau (Rahmen) abholen – deren
    // Overlays lasen den Wunsch manchmal noch vor dem Seitenwechsel, der Raum ging dann nicht auf.
    let inFrame = false;
    try { inFrame = window.self !== window.top; } catch (_) { inFrame = true; }
    if (!inFrame && !/^\/casora-studio/.test(location.pathname)) {
      try { wantRoom = sessionStorage.getItem('casora_open_room'); sessionStorage.removeItem('casora_open_room'); } catch (_) {}
    }
    if (wantRoom && wantRoom !== 'all' && window._casoraFilter) {
      setTimeout(() => {
        try {
          window._casoraFilter.set(wantRoom);
          window._casoraFilter.share(inst._rawHass || inst._hass, wantRoom);
        } catch (_) {}
      }, 700);
    }

    const st = (px) => `calc(env(safe-area-inset-top, 0px) + var(--casora-mobile-chrome-drop, 4px) + ${px}px)`;
    const hardStop = (px, maxA = 1) => {
      const c = maxA >= 1 ? 'black' : `rgba(0,0,0,${maxA})`;
      return `linear-gradient(to bottom, ${c} 0px, ${c} ${st(px)}, transparent ${st(px)})`;
    };

    const gm = hardStop(52);
    const grad = document.createElement('div');
    grad.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0',
      'height:calc(env(safe-area-inset-top, 0px) + 150px)',
      'z-index:110', 'pointer-events:none', 'opacity:0',
      'transition:opacity 220ms ease-in-out',
      'backdrop-filter:blur(22px) saturate(1.2) brightness(0.97)',
      '-webkit-backdrop-filter:blur(22px) saturate(1.2) brightness(0.97)',
      `mask-image:${gm}`, `-webkit-mask-image:${gm}`,
      'transform:translateZ(0)', '-webkit-transform:translateZ(0)',
    ].join(';');

    const veil = document.createElement('div');
    const vm = hardStop(52, 0.5);
    veil.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'z-index:111', 'pointer-events:none', 'opacity:0', 'overflow:hidden',
      'transition:opacity 220ms ease-in-out',
      `mask-image:${vm}`, `-webkit-mask-image:${vm}`,
    ].join(';');
    const veilInner = document.createElement('div');
    veilInner.style.cssText = [
      'position:absolute', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'background-repeat:no-repeat',
      'background-size:100% 100%, cover',
      'filter:blur(8px) saturate(1.02)',
      'transform:scale(1.08)',
      'transform-origin:top center',
    ].join(';');
    veil.appendChild(veilInner);

    const edge = document.createElement('div');
    edge.style.cssText = [
      'position:fixed', 'left:0', 'right:0',
      'top:calc(env(safe-area-inset-top, 0px) + var(--casora-mobile-chrome-drop, 4px) + 51px)',
      'height:11px', 'z-index:112', 'pointer-events:none', 'opacity:0',
      'transition:opacity 220ms ease-in-out',
      'background:linear-gradient(to bottom, rgba(18,20,26,0.025), rgba(18,20,26,0))',
      'border-top:0.5px solid rgba(255,255,255,0.10)',
      'box-sizing:border-box',
    ].join(';');

    const syncVeilBg = () => {
      let bgCard = _dashHeader?.bgCard;
      if (!bgCard?.isConnected) {
        bgCard = _findBgCard();
        if (_dashHeader) _dashHeader.bgCard = bgCard;
      }
      if (!bgCard) {
        if (!veilInner.style.backgroundImage) {
          veilInner.style.backgroundImage = 'linear-gradient(rgba(24,28,38,0.92), rgba(24,28,38,0.92))';
        }
        return;
      }
      const acs = getComputedStyle(bgCard, '::after');
      const bcs = getComputedStyle(bgCard, '::before');
      const bgi = acs.backgroundImage;
      if (!bgi || !bgi.includes('url(')) return;
      const has = (v) => v && v !== 'none';
      const image = has(bcs.backgroundImage) ? `${bcs.backgroundImage}, ${bgi}` : bgi;
      if (veilInner.style.backgroundImage !== image) {
        veilInner.style.backgroundImage = image;
        veilInner.style.backgroundPosition = has(bcs.backgroundImage)
          ? `${bcs.backgroundPosition}, ${acs.backgroundPosition}` : acs.backgroundPosition;
        veilInner.style.backgroundSize = has(bcs.backgroundImage)
          ? `${bcs.backgroundSize}, ${acs.backgroundSize}` : acs.backgroundSize;
      }
    };

    if (!_dashTitleStyle?.isConnected) {
      _dashTitleStyle = document.createElement('style');
      _dashTitleStyle.textContent =
        `.casora-dash-compact-title{padding-left:calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC}) !important;}`;
      (target || document.head).appendChild(_dashTitleStyle);
    }
    const title = document.createElement('div');
    title.className = 'casora-dash-compact-title';
    title.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:112',
      `height:${DASH_BAR_HEIGHT}px`,
      'padding-top:calc(env(safe-area-inset-top, 0px) + var(--casora-mobile-chrome-drop, 4px))',
      'padding-left:max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px))',
      'box-sizing:content-box',
      'display:flex', 'align-items:center', 'justify-content:flex-start',
      'font-size:20px', 'font-weight:700', 'color:var(--casora-mobile-title-color, #ffffff)', 'letter-spacing:-0.3px',
      'opacity:0', 'transform:translateY(5px)', 'pointer-events:none', 'cursor:pointer',
    ].join(';');
    // Übersicht: „Zuhause“ (Quelltext Deutsch), in anderen Sprachen per casoraTr („Home“).
    title.textContent = window.casoraTr ? window.casoraTr('Zuhause') : 'Zuhause';
    // Der kleine Titel übernimmt den fertigen Text des Handy-Kopfs (#name, schon nach
    // casoraRoomName aufgelöst) – nicht noch einmal übersetzen, sonst „Home“ → „Zuhause“.
    title.setAttribute('data-no-i18n', '');
    title.addEventListener('click', () => {
      const se = _dashHeader?.scrollEl;
      if (se === window) window.scrollTo({ top: 0, behavior: 'smooth' });
      else se?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const pillHost = document.createElement('div');
    pillHost.style.cssText = [
      'position:fixed',
      'top:calc(env(safe-area-inset-top, 0px) + var(--casora-mobile-chrome-drop, 4px))',
      'right:16px', 'z-index:113', 'pointer-events:auto',
    ].join(';');

    const pillFlash = document.createElement('div');
    pillFlash.style.cssText = [
      'position:absolute', 'inset:0', 'border-radius:22px',
      'background:rgba(255,255,255,0.22)',
      'opacity:0', 'pointer-events:none',
    ].join(';');
    pillHost.appendChild(pillFlash);
    pillHost.addEventListener('pointerdown', (ev) => {
      const r = pillHost.getBoundingClientRect();
      const x = r.width ? ((ev.clientX - r.left) / r.width) * 100 : 50;
      pillFlash.style.background = 'radial-gradient(circle at '
        + Math.max(0, Math.min(100, x)).toFixed(1) + '% 50%,'
        + ' rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.15) 55%,'
        + ' rgba(255,255,255,0.05) 100%)';
      pillFlash.style.transition = 'opacity 140ms ease-out';
      pillFlash.style.opacity = '1';
      setTimeout(() => {
        pillFlash.style.transition = 'opacity 420ms cubic-bezier(0.4,0,0.6,1)';
        pillFlash.style.opacity = '0';
      }, 150);
    }, true);

    target.appendChild(grad);
    target.appendChild(veil);
    target.appendChild(edge);
    target.appendChild(title);
    target.appendChild(pillHost);
    requestAnimationFrame(() => {
      _pinChromePill(pillHost, inst._container || document);
    });

    const hide = () => {
      _dashBarOn                = false;
      grad.style.opacity        = '0';
      veil.style.opacity        = '0';
      edge.style.opacity        = '0';
      title.style.opacity       = '0';
      title.style.pointerEvents = 'none';
    };

    const update = () => {
      if (!grad.isConnected) return;
      if (_activeOverlay) { hide(); return; }
      if (_pinnedPill && _pinnedPill.host.style.opacity === '0') _showChromePill();
      let headerEl = inst._headerEl;
      if (!headerEl?.isConnected || !inst._container?.isConnected) {
        // Both are nulled on dismiss, and HA can re-render the cards.
        inst._discoverElements();
        headerEl = inst._headerEl;
        if (!headerEl?.isConnected) { hide(); return; }
      }
      const nameEl = headerEl.shadowRoot?.querySelector('#name');
      const src    = nameEl || headerEl;
      const rect   = src.getBoundingClientRect();
      if (!rect.height) { hide(); return; }
      const barBottom = title.getBoundingClientRect().bottom;
      const safeTop   = barBottom - DASH_BAR_HEIGHT;
      const p = Math.max(0, Math.min(1,
        (barBottom + 24 - rect.bottom) / (barBottom + 24 - safeTop)));
      const tp = Math.min(1, p / 0.45);
      if (nameEl) {
        nameEl.style.animation  = 'none'; // titleFadeIn's fill:both beats inline opacity
        nameEl.style.opacity    = String(1 - tp); // full white at rest, like Apple's large titles
      }
      const nameText = nameEl?.textContent?.trim();
      if (nameText && title.textContent !== nameText) title.textContent = nameText;
      const cp = Math.max(0, (p - 0.55) / 0.45);
      title.style.opacity       = String(cp);
      title.style.transform     = `translateY(${(1 - cp) * 5}px)`;
      title.style.pointerEvents = cp > 0.5 ? 'auto' : 'none';
      const badgeRect = inst._badgeRowEl?.getBoundingClientRect();
      let barOn;
      if (badgeRect && badgeRect.height) {
        barOn = _dashBarOn
          ? badgeRect.bottom <= barBottom + 8
          : badgeRect.bottom <= barBottom;
      } else {
        barOn = p >= 1;
      }
      _dashBarOn = barOn;
      grad.style.opacity = barOn ? '1' : '0';
      edge.style.opacity = barOn ? '1' : '0';
      syncVeilBg();
      veil.style.opacity = barOn ? '1' : '0';
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; update(); });
    };
    const scrollEl = _findScrollAncestor(inst._container) || window;
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('touchmove', onScroll, { passive: true, capture: true });

    _dashHeader = { grad, veil, edge, title, pillHost, scrollEl, onScroll, update, hide, inst, bgCard: null };
    update();
  }

  class CasoraFilterOverlay extends HTMLElement {
    constructor() {
      super();
      this._hass         = null;
      this._config       = null;
      this._helpers      = null;
      this._blurLayerEl  = null;
      this._overlayEl    = null;
      this._contentEl    = null;
      this._cardEls      = [];
      this._showing      = false;
      this._initialized  = false;
      this._initializing = false;

      this._container        = null;
      this._selfWrapper      = null;
      this._badgeRowEl       = null;
      this._badgeRowWrapper  = null;
      this._headerEl         = null;
      this._subBadgesEl      = null;
      this._subBadgesWrapper = null;
      this._scalableEls      = [];

      this._noScrollStyle   = null;
      this._bodyScrollStyle = null;

      this._titleEl               = null;
      this._compactHeaderEl       = null;
      this._gradientBlurEl        = null;
      this._subBadgesSavedParent  = null;
      this._subBadgesSavedSibling = null;
      this._npWrapper             = null;
      this._npSaved               = null;
      this._npSpacer              = null;
      this._gapSpacer             = null;
      this._npNaturalTop          = null;
      this._appendTarget          = null;

      this._pendingBlurFade    = null;
      this._favPopupDone       = false;
      this._autoSectionsDone   = false;
      this._suppressedWrappers = [];
      this._hiddenSmartRows    = [];
      this._scrollHandler      = null;
      this._cardSectionEl      = null;
      this._badgePopupStyle    = null;
      this._badgeShadowCards   = [];
      this._headerWrapper      = null;
    }


    connectedCallback() {
      this.style.cssText = 'display:none!important;';
      if (this._config && !this._initialized && !this._initializing) this._init();
    }

    disconnectedCallback() {
      // casora-local-patch (03.10.2026): Die Reihe hängt ihre Karten beim Sortieren um – das
      // Overlay wird dabei ab- und angehängt. Lag die Badge-Reihe des Raums (Unter-Badges) da
      // noch im Overlay-Inhalt, ging sie mit ihm verloren; beim Neuaufbau nahm das Overlay die
      // nächste Karte (Mini-Player) als Badge-Reihe. Darum erst zurück an ihren Platz.
      // Nur, was dieses Overlay selbst verschoben hat – die Reihe teilen sich alle Raum-Overlays.
      if (this._subBadgesSavedParent || this._npSaved) {
        try { this._restoreMovedWrappers(); } catch (_) {}
      }
      if (this._blurLayerEl) _blurLayers.delete(this._blurLayerEl);
      this._blurLayerEl?.remove();
      this._blurTwinObs?.disconnect(); this._blurTwinEl?.remove(); this._blurTwinObs = this._blurTwinEl = null; // casora-local-patch
      this._overlayEl?.remove();
      this._compactHeaderEl?.remove();
      this._compactHeaderEl = null;
      this._gradientBlurEl?.remove();
      this._gradientBlurEl = null;
      if (_movedBadgeRow && _movedBadgeRow.owner === this) _restoreBadgeRow();
      if (_activeOverlay === this) _activeOverlay = null;
      _showChromePill();
      // Neu angehängt wird neu aufgebaut und dann wieder gezeigt (siehe _init) – samt der
      // Raum-Kacheln und Favoriten, die im verworfenen Inhalt lagen.
      this._showing = false;
      this._autoSectionsDone = false;
      this._favPopupDone = false;
      this._blurLayerEl = this._overlayEl = this._contentEl = null;
      this._cardEls = [];
      this._scalableEls  = [];
      this._headerWrapper = null;
      this._initialized  = false;
    }

    static getConfigElement() { return document.createElement('div'); }
    static getStubConfig()    { return { filter_category: 'climate', sections: [] }; }

    setConfig(config) {
      if (!config.filter_category && config.room) {
        const slug = String(config.room).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (slug) config = { ...config, filter_category: 'room_' + slug };
      }
      if (!config.filter_category) throw new Error('casora-filter-overlay: filter_category or room required');
      if (config.filter_category === 'room_scenes' && !config.sections) {
        config = { ...config, sections: [{
          full_width: true,
          // A static grid gets _appendEntityGrid's inset; the scrolling row bleeds instead.
          cards: [{
            type: 'custom:button-card',
            template: 'casora_scene_row',
            variables: { layout: 'grid' },
            // The card carries the entity grid's inset; the row's own rail padding would double it.
            styles: {
              card: [{ padding: `0 calc(var(--casora-rail-left, 16px) + ${LANDSCAPE_GUTTER_CALC}) 0 calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})` }],
              custom_fields: { scenes_row: [{ 'padding-left': '0 !important' }, { 'padding-right': '0 !important' }] },
            },
          }],
        }] };
      }
      this._config = config;
      if (this.isConnected && !this._initialized && !this._initializing) this._init();
    }

    set hass(v) {
      // Per device, like the row: rewrite before the overlay or its cards read it.
      this._rawHass = v;
      const F = window._casoraFilter;
      if (F && !this._filterOff) {
        this._filterOff = F.onChange(() => {
          if (this._rawHass) this.hass = this._rawHass;
        });
      }
      const prevFilter = this._hass?.states?.['input_select.casora_mobile_filter']?.state;
      v = F ? F.apply(v) : v;
      this._hass = v;
      for (const el of this._cardEls) { try { el.hass = v; } catch (_) {} }
      const filter = v?.states?.['input_select.casora_mobile_filter']?.state;
      // Offene Raumseite: schaltet eine Kachel um, rückt sie wie in der Reihe nach kurzer Pause
      // nach vorn bzw. zurück (Issue #6).
      // Kein Neustart der Wartezeit bei jedem Update: Im belebten Haus kommen ständig neue
      // Zustände, dann würde nie sortiert.
      if (this._config?.room && this._showing && this._contentEl && filter === this._config.filter_category
        && !this._resortTimer) {
        this._resortTimer = setTimeout(() => { this._resortTimer = null; if (this._showing) this._sortSectionGrids(); }, 2500);
      }

      if (this._pendingBlurFade && filter === 'all' && prevFilter !== 'all') {
        setTimeout(() => {
          if (!this._pendingBlurFade) return;
          requestAnimationFrame(() => requestAnimationFrame(() => this._runBlurFade()));
        }, 250);
      }

      const shouldShow = filter === this._config?.filter_category;
      if (shouldShow !== this._showing) {
        this._showing = shouldShow;
        if (shouldShow) {
          // Noch nicht aufgebaut: _init zeigt am Ende selbst, was dann gewünscht ist.
          this._initialized ? this._animIn() : this._init();
        } else {
          this._animOut();
        }
      }
    }

    async _init() {
      if (this._initializing || this._initialized) return;
      this._initializing = true;
      try {
        if (!this._helpers) this._helpers = await window.loadCardHelpers();
        this._buildOverlay();
        this._initialized = true;
      } catch (e) {
        console.error('[casora-filter-overlay] init error:', e);
      } finally {
        this._initializing = false;
      }
      // casora-local-patch (03.10.2026): Raum blieb beim ersten Laden leer. Baut die Ansicht die
      // Reihe beim Start neu auf, wird dieses Overlay ab- und wieder angehängt – schon „gezeigt“,
      // aber neu und leer aufgebaut; ein _init, das noch lief, zeigte gar nicht. Am Ende darum
      // nach dem aktuellen Filter zeigen (erst das zweite Öffnen des Raums half bisher).
      if (!this._initialized || !this._hass || !this.isConnected) return;
      const want = this._hass.states?.['input_select.casora_mobile_filter']?.state === this._config?.filter_category;
      if (want) { this._showing = true; this._animIn(); }
    }

    _buildOverlay() {
      if (this._overlayEl) return;

      this._discoverElements();
      const shadowRoot   = this._container?.getRootNode?.();
      const inShadow     = shadowRoot instanceof ShadowRoot;
      const appendTarget = inShadow ? shadowRoot : document.body;
      this._appendTarget = appendTarget;


      // html/body scrollbar hiding - always in document.head (not shadow root scoped)
      if (!this._bodyScrollStyle) {
        const s = document.createElement('style');
        s.textContent = 'html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}html,body{scrollbar-width:none!important;-ms-overflow-style:none!important}';
        document.head.appendChild(s);
        this._bodyScrollStyle = s;
      }

      // Must be injected here: document.head doesn't reach this shadow root.
      if (!this._noScrollStyle) {
        const s = document.createElement('style');
        s.textContent = [
          '[data-casora-filter-overlay]::-webkit-scrollbar{display:none!important}',
          '[data-casora-filter-overlay]{scrollbar-width:none!important}',
        ].join(' ');
        (inShadow ? shadowRoot : document.head).appendChild(s);
        this._noScrollStyle = s;
      }

      // Blur layer: backdrop-filter and tint, no scroll, no pointer events.
      const blurLayer = document.createElement('div');
      blurLayer.setAttribute('data-casora-filter-blur', this._config.filter_category);
      Object.assign(blurLayer.style, {
        position:             'fixed',
        top: '0', left: '0', right: '0', bottom: '0',
        zIndex:               '49',
        backdropFilter:       'blur(40px)',
        webkitBackdropFilter: 'blur(40px)',
        background:           'var(--casora-filter-veil, rgba(0, 0, 0, 0.22))',
        pointerEvents:        'none',
        display:              'none',
        transform:            'translateZ(0)',
        webkitTransform:      'translateZ(0)',
        willChange:           'transform',
      });
      // casora-local-patch: in der Raum-Ansicht das eigene Raumfoto (geblurrt) statt nur Blur über Home.
      this._blurLayerRoomBg = null;
      {
        // Das Studio schreibt das Raumfoto mit (image/image_night) – auch nach Umbenennen.
        const _rp = this._config.room ? (this._config.image || ROOM_PHOTOS[this._config.room]) : null;
        if (_rp) {
          const _dark = typeof this._hass?.themes?.darkMode === 'boolean'
            ? this._hass.themes.darkMode : window.matchMedia('(prefers-color-scheme: dark)').matches;
          const _pic = _dark ? (this._config.image_night || _rp + '-night') : _rp;
          this._blurLayerRoomBg = `var(--casora-wallpaper-veil-light, linear-gradient(transparent, transparent)) 0 96px / 100% 100lvh no-repeat, linear-gradient(var(--casora-filter-veil, rgba(8,10,14,0.32)), var(--casora-filter-veil, rgba(8,10,14,0.32))) center center / cover no-repeat, url("/casora_assets/rooms/${_pic}.jpg") center center / cover no-repeat`;
          Object.assign(blurLayer.style, {
            backdropFilter: 'none', webkitBackdropFilter: 'none',
            background: this._blurLayerRoomBg, filter: `blur(${ROOM_PHOTO_BLUR}) saturate(1.05)`,
            top: '-96px', left: '-96px', right: 'auto', bottom: 'auto', // Blur-Rand (läuft transparent aus) außerhalb des Bildschirms;
            width: 'calc(100vw + 192px)', height: 'calc(100lvh + 192px)', // feste Bildschirmmaße, unabhängig vom Eltern-Element
            transform: 'translateZ(0)', webkitTransform: 'translateZ(0)',
          });
          // Zwilling direkt in <body> (z-index -1): Die Ebene oben hängt in einem verschobenen
          // Casora-Element und wird an dessen Rand abgeschnitten (rechts ~16 px). Der Zwilling
          // liegt unter allem Seiteninhalt, deckt aber das Home-Wallpaper in diesem Streifen ab.
          try {
            const _tw = document.createElement('div');
            _tw.setAttribute('data-casora-room-bg-twin', this._config.room);
            _tw.style.cssText = blurLayer.style.cssText;
            Object.assign(_tw.style, { position: 'fixed', zIndex: '-1', width: 'calc(100vw + 192px)', height: 'calc(100lvh + 192px)' });
            document.body.appendChild(_tw);
            const _sync = () => {
              _tw.style.display = blurLayer.style.display;
              _tw.style.opacity = blurLayer.style.opacity;
              _tw.style.transition = blurLayer.style.transition;
              _tw.style.background = blurLayer.style.background;
            };
            this._blurTwinObs = new MutationObserver(_sync);
            this._blurTwinObs.observe(blurLayer, { attributes: true, attributeFilter: ['style'] });
            this._blurTwinEl = _tw;
            _sync();
          } catch (_) {}
        }
      }
      appendTarget.appendChild(blurLayer);
      this._blurLayerEl = blurLayer;
      _blurLayers.add(blurLayer);

      const overlay = document.createElement('div');
      overlay.setAttribute('data-casora-filter-overlay', this._config.filter_category);
      Object.assign(overlay.style, {
        position:           'fixed',
        top: '0', left: '0', right: '0', bottom: '0',
        zIndex:             '50',
        background:         'transparent',
        overflowY:          'auto',
        overflowX:          'hidden',
        touchAction:        'pan-x pan-y',
        scrollbarWidth:     'none',
        display:            'none',
      });

      // A tap on a card retargets e.target, so test the composed path instead.
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target === content) {
          this._dismiss();
        }
      });

      const content = document.createElement('div');
      content.style.cssText = [
        'position:relative',
        // Mit der Leiste unten (casora-mobile-nav) deren Höhe freihalten, sonst liegt die letzte Kachelreihe darunter.
        'padding-bottom:calc(16px + var(--casora-mobile-nav-space, env(safe-area-inset-bottom,0px)))',
        'width:100%',
        'box-sizing:border-box',
      ].join(';');
      overlay.appendChild(content);
      this._contentEl = content;

      content.style.setProperty('--casora-anim-delay',    '-1s');
      content.style.setProperty('--casora-anim-duration', '0.001s');

      const sections = this._config.sections || [];
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const animIdx = section.static ? null : i;

        // Omit a section's name to get a flat, headerless card group.
        if (section.name) {
          this._appendRevealCard({
            type:      'custom:button-card',
            template:  'casora_mobile_header',
            full_width: true,
            name:      section.name,
            variables: { mobile_filter_categories: null },
            styles:    {
              card:          [{ padding: '24px 0px 8px 11px' }],
              custom_fields: { arrow: [{ display: 'none' }] },
            },
          }, content, animIdx);
        }

        if (section.full_width) {
          // Full-width blocks instead of the two-column entity grid.
          for (const c of section.cards || []) this._appendRevealCard(c, content, animIdx);
        } else {
          this._appendEntityGrid(section.cards || [], content, animIdx);
        }
      }

      appendTarget.appendChild(overlay);
      this._overlayEl = overlay;

      if (this._hass) {
        for (const el of this._cardEls) { try { el.hass = this._hass; } catch (_) {} }
      }

      const tryDashExtras = (n) => {
        const headerDone = !!_dashHeader?.grad?.isConnected;
        if (!_activeOverlay) {
          this._discoverElements();
          if (!headerDone && this._headerEl) _ensureDashboardHeader(this);
          // Give the sub-badge rows real scrollWidth as soon as they render.
          _fixRowWidths(this._container);
        }
        if (n < 20 && !headerDone) setTimeout(() => tryDashExtras(n + 1), 500);
      };
      tryDashExtras(0);
    }

    _appendRevealCard(cfg, parent, animIndex) {
      const el = this._helpers.createCardElement(cfg);
      if (!el) return;
      if (this._hass) { try { el.hass = this._hass; } catch (_) {} }
      const wrap = document.createElement('div');
      wrap.style.cssText = `display:block;width:100%;box-sizing:border-box;opacity:${animIndex == null ? '1' : '0'};`;
      if (animIndex != null) wrap._animIndex = animIndex;
      wrap.appendChild(el);
      parent.appendChild(wrap);
      this._cardEls.push(el);
    }

    _appendEntityGrid(cards, parent, animIndex) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:block;width:100%;box-sizing:border-box;opacity:0;margin-bottom:8px;touch-action:pan-y;';
      wrap._animIndex = animIndex;

      if (!this._entityGridStyle) {
        const st = document.createElement('style');
        st.textContent =
          '.casora-entity-grid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
          '@media (max-width:767px) and (orientation:portrait),' +
          '(max-height:500px) and (orientation:portrait),' +
          '(max-height:600px) and (orientation:landscape){' +
          '.casora-entity-grid{grid-auto-rows:var(--casora-tile-row-h-current,66px);' +
          // Handy-Kachelabstand wie im Zuhause-Raster (smart-row): der Look darf ihn setzen.
          '--casora-entity-grid-gap:var(--casora-tile-row-gap-mobile,8px);' +
          'grid-auto-flow:row dense;align-items:stretch;}' +
          '.casora-entity-grid > [data-casora-size="large"]{grid-row:span 2;}}' +
          '@media (max-height:600px) and (orientation:landscape){' +
          '.casora-entity-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}';
        (this._appendTarget || document.head).appendChild(st);
        this._entityGridStyle = st;
      }

      const grid = document.createElement('div');
      grid.className = 'casora-entity-grid';
      grid.style.cssText = [
        'display:grid',
        'gap:var(--casora-entity-grid-gap,8px)',
        `padding-left:calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})`,
        `padding-right:calc(var(--casora-rail-left, 16px) + ${LANDSCAPE_GUTTER_CALC})`,
        'box-sizing:border-box',
        'width:100%',
      ].join(';');

      for (const cardCfg of cards) {
        const card = this._helpers.createCardElement(cardCfg);
        if (!card) continue;
        if (this._hass) { try { card.hass = this._hass; } catch (_) {} }
        // „Size on phone“ (variables.size) zählt nur im Handy-Dashboard, wie in smart-row.
        let sizeCfg = cardCfg;
        if (!/^\/[^/]*[-_]mobile(\/|$)/i.test(window.location.pathname) && cardCfg?.variables?.size !== undefined) {
          const { size, ...rest } = cardCfg.variables;
          sizeCfg = { ...cardCfg, variables: rest };
        }
        const cardSize = window.casoraCardSize?.(sizeCfg)
          || (String(sizeCfg?.variables?.size || '').toLowerCase() === 'large' ? 'large' : 'small');
        if (cardSize === 'large') card.dataset.casoraSize = 'large';
        grid.appendChild(card);
        this._cardEls.push(card);
      }

      wrap._casoraGrid = grid;
      wrap.appendChild(grid);
      parent.appendChild(wrap);
    }

    // casora-local-patch (03.10.2026): Raum direkt nach dem Laden geöffnet (Handy, v. a. Safari):
    // Kacheln und Raum-Badges fehlten, weil Reihe und Badge-Karte erst danach fertig wurden –
    // sichtbar erst beim zweiten Öffnen. Solange der Raum offen ist, kurz nachziehen.
    _settleRoom(n) {
      if (!this._showing || _activeOverlay !== this || !this._contentEl) return;
      this._keepBlurUp();
      if (!this._autoSectionsDone) {
        this._ensureAutoSections();
        if (this._autoSectionsDone) this._sortSectionGrids();
      }
      const sb = this._subBadgesWrapper && this._getBC(this._subBadgesWrapper);
      if (sb && this._hass && this._subBadgesWrapper.parentNode === this._contentEl) {
        try { sb.hass = this._hass; } catch (_) {}
        _flushRender(sb);
      }
      const sbOk = !sb || sb.getBoundingClientRect().height > 0;
      if (n < 16 && (!this._autoSectionsDone || !sbOk)) setTimeout(() => this._settleRoom(n + 1), 300);
    }

    // #9: Der gezeigte Raum hat immer seine Hintergrundebene (Raumfoto + Schleier): eingehängt,
    // sichtbar, mit Foto. Sonst schien die Startseite (Foto, Überschriften) durch die Raumkacheln.
    _keepBlurUp() {
      const b = this._blurLayerEl;
      if (!this._showing || _activeOverlay !== this || !b) return;
      if (!b.isConnected && this._appendTarget) { this._appendTarget.appendChild(b); _blurLayers.add(b); }
      if (this._blurTwinEl && !this._blurTwinEl.isConnected) document.body.appendChild(this._blurTwinEl);
      if (b.style.display === 'none' || b.style.opacity !== '1') {
        b.style.transition = 'none';
        b.style.display = 'block';
        b.style.opacity = '1';
      }
      if (this._blurLayerRoomBg && b.style.background.indexOf('/casora_assets/rooms/') < 0) b.style.background = this._blurLayerRoomBg;
    }

    _ensureAutoSections() {
      if (this._autoSectionsDone) return;
      if ((this._config.sections || []).length) { this._autoSectionsDone = true; return; }
      const container = this._container;
      if (!container || !this._helpers || !this._contentEl) return;
      const roomMode = this._config.room || null;
      const rooms = [];
      let pending = null; // last seen room header
      for (const kid of container.children) {
        const bc = this._getBC(kid);
        const t  = bc?._config?.template;
        const isHdr = t === 'casora_mobile_header' ||
          (Array.isArray(t) && t.includes('casora_mobile_header'));
        if (isHdr) {
          pending = {
            name:    bc._config?.name,
            roomKey: bc._config?.variables?.room_key,
            fav:     _isFavHeader(bc._config),
          };
          continue;
        }
        const hsr = kid.querySelector?.('casora-smart-row');
        if (hsr && pending) {
          if (roomMode) {
            if (pending.name === roomMode) {
              // Wie die Reihe am Desktop: aktive Kacheln vorn, außer die Reihe sortiert nicht (sort: false).
              rooms.push({ ...pending, cards: (hsr._config?.cards || []).slice(), sort: hsr._config?.sort !== false });
            }
          } else if (pending.name && !pending.fav) {
            const cards = (hsr._config?.cards || []).filter(
              (c) => _cardCategory(c) === this._config.filter_category);
            if (cards.length) rooms.push({ ...pending, cards });
          }
          pending = null;
        }
      }
      // casora-local-patch (03.10.2026): Beim ersten Laden ist die Reihe des Raums oft noch nicht
      // aufgebaut – dann nicht für immer „erledigt“ merken (Raum blieb ohne Kacheln bis zum
      // nächsten Öffnen), sondern erneut versuchen (_settleRoom, nächstes Öffnen).
      if (!rooms.length && roomMode) return;
      this._autoSectionsDone = true;
      if (!rooms.length) {
        // Kategorie ohne Kacheln (z. B. Energie ohne zugeordnete Geräte): Hinweis statt leerer
        // Seite (Weich-Audit M5). Bringen die Favoriten doch Kacheln, nimmt
        // _ensureFavoritesPopupSection den Hinweis wieder heraus.
        if (this._config.filter_category) this._appendEmptyHint();
        return;
      }
      let i = 0;

      // Casora (30.09.2026): Entitäten der Raum-Kacheln – daraus findet die Szenenliste den
      // Bereich, wenn der Raum umbenannt wurde („Kochecke“, Bereich „Küche“).
      const roomEntities = [];
      if (roomMode) {
        const ENT = /^[a-z_]+\.[a-z0-9_]+$/;
        const add = (x) => { if (typeof x === 'string' && ENT.test(x) && !roomEntities.includes(x)) roomEntities.push(x); };
        // Auch Entitäten in variables/verschachtelten Karten (Geräte-Kacheln, conditional).
        const walk = (x, d) => { if (d > 6 || !x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach((y) => walk(y, d + 1)); return; }
          Object.keys(x).forEach((k) => { const y = x[k]; if (typeof y === 'string') { if (k === 'entity' || k === 'entity_id' || /^entity_|_entity(_\d+)?$/.test(k)) add(y); } else walk(y, d + 1); }); };
        rooms.forEach((r) => (r.cards || []).forEach((c) => add(c && c.entity)));
        rooms.forEach((r) => walk(r.cards, 0));
      }
      if (roomMode && this._config.scenes !== false && window._casoraSC) {
        let sceneCount = 0;
        try {
          const c = this._config;
          sceneCount = window._casoraSC.list(this._hass?.states || {}, this._hass, {
            room: roomMode, area: c.area || null, room_entities: roomEntities, scenes: c.scenes, scene_exclude: c.scene_exclude, scene_order: c.scene_order,
          }).length;
        } catch (_) { sceneCount = 0; }
        if (sceneCount) {
          this._appendRevealCard({
            type:       'custom:button-card',
            template:   'casora_mobile_header',
            full_width: true,
            name:       'Szenen',
            variables:  { hide_caret: true, mobile_filter_categories: null },
            styles:     {
              card:          [{ padding: `24px var(--casora-rail-left, 16px) 10px calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})` }],
              custom_fields: { arrow: [{ display: 'none' }] },
            },
          }, this._contentEl, 0);
          this._appendRevealCard({
            type:       'custom:button-card',
            template:   'casora_scene_row',
            full_width: true,
            variables:  { layout: 'grid', room: roomMode, area: this._config.area || null, room_entities: roomEntities }, // casora-local-patch: 2-Spalten-Raster statt Scroll-Reihe
            styles:     { card: [{ '--casora-scene-row-gap': '18px' }, { '--casora-scene-grid-col-gap': '8px' }, { '--casora-scene-grid-row-gap': '8px' }] },
          }, this._contentEl, 0);
        }
      }

      for (const room of rooms) {
        if (!roomMode) {
          this._appendRevealCard({
            type:      'custom:button-card',
            template:  'casora_mobile_header',
            full_width: true,
            name:      room.name,
            variables: { room_key: room.roomKey || null,
                         mobile_filter_categories: null },
            styles:    {
              card:          [{ padding: `24px var(--casora-rail-left, 16px) 10px calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})` }],
              custom_fields: { arrow: [{ display: 'none' }] },
            },
          }, this._contentEl, i);
        }
        const roomCards = room.cards.map((c) => JSON.parse(JSON.stringify(c)));

        // Casora (30.09.2026): Die Raumseite zeigt die Kacheln in der Studio-Reihenfolge
        // (room.tiles, per syncPairTiles aufs Handy übernommen). Nach Kategorien gruppiert
        // wird nur auf Wunsch (siehe _roomGroupOn).
        // Nur eine Kategorie oder sehr wenige Kacheln: flach wie bisher („Geräte“).
        const groups = roomMode && _roomGroupOn(this._config) ? _roomGroupSplit(roomCards) : null;
        if (groups) {
          let first = !this._contentEl.children.length;
          for (const { key, cards } of groups) {
            this._appendGroupHeader(key, first, i);
            first = false;
            this._appendEntityGrid(cards, this._contentEl, i);
            if (room.sort === false) this._contentEl.lastElementChild._casoraNoSort = true;
            i++;
          }
        } else {
          if (roomMode && this._contentEl.children.length) { // casora-local-patch: Trenner nach den Szenen
            this._appendRevealCard({
              type:       'custom:button-card',
              template:   'casora_mobile_header',
              full_width: true,
              name:       'Geräte',
              variables:  { hide_caret: true, mobile_filter_categories: null },
              styles:     {
                card:          [{ padding: `18px var(--casora-rail-left, 16px) 10px calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})` }],
                custom_fields: { arrow: [{ display: 'none' }] },
              },
            }, this._contentEl, i);
          }
          this._appendEntityGrid(roomCards, this._contentEl, i);
          if (room.sort === false) this._contentEl.lastElementChild._casoraNoSort = true;
          i++;
        }
      }
      if (this._hass) {
        for (const el of this._cardEls) { try { el.hass = this._hass; } catch (_) {} }
      }
    }

    // Raum-Kategorien: Überschrift einer Gruppe – seit dem Weich-Audit (M4, 05.10.2026) in derselben
    // Stufe wie „Szenen“ (casora_mobile_header: Größe, 700, Titelfarbe, 24 px oben / 10 px unten),
    // vorher kleiner und grau, das wirkte wie zwei Gliederungsebenen.
    _appendGroupHeader(key, first, animIdx) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:block;width:100%;box-sizing:border-box;opacity:0;';
      wrap._animIndex = animIdx;
      wrap.setAttribute('data-casora-room-group', key);
      const left = `calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC} + 2px)`;
      const right = `calc(var(--casora-rail-left, 16px) + ${LANDSCAPE_GUTTER_CALC} + 2px)`;
      const head = document.createElement('div');
      head.style.cssText = [
        `padding:${first ? 14 : 24}px ${right} 10px ${left}`,
        'font-family:var(--casora-body-font, var(--primary-font-family, inherit))',
        'font-size:var(--casora-mobile-section-size, 18px)', 'font-weight:700', 'letter-spacing:-0.3px', 'line-height:1.3',
        'color:var(--casora-room-group-ink, var(--casora-mobile-title-color, var(--primary-text-color)))',
        'box-sizing:border-box', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
      ].join(';');
      head.textContent = _roomGroupHeading(key);
      wrap.appendChild(head);
      this._contentEl.appendChild(wrap);
    }

    _appendEmptyHint() {
      if (this._emptyHintEl?.isConnected) return;
      const tr = (t) => (window.casoraTr ? window.casoraTr(t) : t);
      const el = document.createElement('div');
      el.setAttribute('data-casora-empty-hint', '');
      el.setAttribute('data-no-i18n', '');
      el.style.cssText = [
        'box-sizing:border-box', 'width:100%', 'text-align:center',
        `padding:40px calc(var(--casora-rail-left, 16px) + ${LANDSCAPE_GUTTER_CALC}) 24px`,
        'font-family:var(--casora-body-font, var(--primary-font-family, inherit))',
      ].join(';');
      const h = document.createElement('div');
      h.style.cssText = 'font-size:16px;font-weight:700;letter-spacing:-0.2px;color:var(--casora-mobile-title-color, var(--primary-text-color));';
      h.textContent = tr('Hier gibt es noch keine Geräte');
      const sub = document.createElement('div');
      sub.style.cssText = 'margin-top:4px;font-size:13px;font-weight:500;color:var(--casora-text-2, var(--secondary-text-color));';
      sub.textContent = tr('Im Casora Studio einem Raum zuordnen');
      el.append(h, sub);
      this._contentEl.appendChild(el);
      this._emptyHintEl = el;
    }

    _ensureFavoritesPopupSection() {
      if (this._favPopupDone) return;
      const container = this._container;
      if (!container || !this._helpers || !this._contentEl) return;
      let rowEl = null, seenHeader = false, favName = 'Favorites';
      for (const kid of container.children) {
        if (!seenHeader) {
          const hc = this._getBC(kid)?._config;
          if (_isFavHeader(hc)) { seenHeader = true; favName = hc.name || favName; }
        } else {
          rowEl = kid.querySelector?.('casora-smart-row') ||
            (kid.tagName?.toLowerCase() === 'casora-smart-row' ? kid : null);
          break;
        }
      }
      const cards = (rowEl?._config?.cards || []).filter(
        (c) => _cardCategory(c) === this._config.filter_category);
      this._favPopupDone = true; // attempted, so don't rescan on every open
      if (!cards.length) return;
      if (this._emptyHintEl) { this._emptyHintEl.remove(); this._emptyHintEl = null; }
      const frag = document.createDocumentFragment();
      this._appendRevealCard({
        type:      'custom:button-card',
        template:  'casora_mobile_header',
        full_width: true,
        name:      favName,
        variables: { favorites: true, hide_caret: true, mobile_filter_categories: null },
        // Mirrors casora_mobile_header.yaml's padding formula.
        styles:    { card: [{ padding: `24px var(--casora-rail-left, 16px) 10px calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})` }] },
      }, frag, 0);
      this._appendEntityGrid(cards.map((c) => JSON.parse(JSON.stringify(c))), frag, 0);
      this._contentEl.insertBefore(frag, this._contentEl.firstChild);
      if (this._hass) {
        for (const el of this._cardEls) { try { el.hass = this._hass; } catch (_) {} }
      }
    }

    _sortSectionGrids() {
      if (!this._hass?.states || !this._contentEl) return;
      // Raumseiten (04.10.2026, Issue #6): aktive Kacheln vorn wie in der Reihe am Desktop und am
      // Handy-Home (casora-smart-row), innerhalb der Gruppen die Studio-Reihenfolge. Vorher blieb die
      // Raumseite bewusst unsortiert (30.09.) – eingeschaltetes Licht stand dann z. B. ganz hinten.
      // Ausnahme: Die Reihe des Raums sortiert nicht (sort: false).
      const ACTIVE = activeStates();
      for (const wrap of Array.from(this._contentEl.children)) {
        const grid = wrap._casoraGrid;
        if (!grid || wrap._casoraNoSort) continue;
        const items = Array.from(grid.children).map(card => {
          const bc = card.tagName?.toLowerCase() === 'button-card' ? card
            : card.querySelector?.('button-card');
          let active = null;
          const ha = bc?.shadowRoot?.querySelector('ha-card');
          if (ha) {
            let v = ha.style.getPropertyValue('--casora-active-overlay-opacity').trim();
            if (!v) { try { v = getComputedStyle(ha).getPropertyValue('--casora-active-overlay-opacity').trim(); } catch (_) {} }
            if (v) active = v === '1';
          }
          if (active === null) {
            const entityId = bc?._config?.entity;
            const state = entityId ? this._hass.states[entityId]?.state : null;
            active = state != null && ACTIVE.has(state.toLowerCase());
          }
          return { card, active };
        });
        // Sort active cards first, maintaining relative order within each group.
        const active   = items.filter(x => x.active);
        const inactive = items.filter(x => !x.active);
        [...active, ...inactive].forEach(({ card }, idx) => { card.style.order = idx; });
      }
    }

    _dismiss() {
      if (!this._hass || !this._showing) return;
      this._showing = false;
      if (_activeOverlay === this) _activeOverlay = null;

      const blurEl    = this._blurLayerEl;
      const overlayEl = this._overlayEl;
      if (!blurEl || !overlayEl) return;

      // ── Phase 1: cleanup and overlay slide ──────────────────────────────────
      this._suppressedWrappers = [];
      this._hiddenSmartRows    = [];
      for (const hsr of (window._casoraSmartRows || [])) {
        const sr = hsr.shadowRoot;
        if (sr) {
          for (const wrapper of sr.querySelectorAll('.card-wrapper')) {
            if (wrapper === this._badgeRowWrapper && !this._config?.room) continue;
            if (this._headerEl && wrapper.contains(this._headerEl)) continue;
            wrapper.style.setProperty('--casora-anim-name',     'none');
            wrapper.style.setProperty('--casora-anim-duration', '0.001s');
            wrapper.style.setProperty('--casora-anim-delay',    '-1s');
            wrapper.style.setProperty('opacity', '0', 'important');
            // opacity:0 still hit-tests.
            wrapper.style.setProperty('pointer-events', 'none', 'important');
            this._suppressedWrappers.push(wrapper);
          }
        }
      }

      if (this._container) {
        this._container.style.setProperty('--casora-anim-name', 'none');
        this._container.style.setProperty('--casora-anim-duration', '0.001s');
        this._container.style.setProperty('--casora-anim-delay', '-1s');
      }

      if (this._contentEl) this._contentEl.style.visibility = 'hidden';
      if (this._scrollHandler) {
        this._overlayEl?.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
      if (this._titleEl) { this._titleEl.remove(); this._titleEl = null; }
      this._backBtn?.remove();
      this._backBtn = null;
      if (this._compactHeaderEl) { this._compactHeaderEl.remove(); this._compactHeaderEl = null; }
      if (this._headFillEl) { this._headFillEl.remove(); this._headFillEl = null; }
      if (this._gradientBlurEl)  { this._gradientBlurEl.remove();  this._gradientBlurEl  = null; }
      if (_movedBadgeRow && _movedBadgeRow.owner === this) _restoreBadgeRow();
      const npWasMoved = !!this._npSaved;
      this._restoreMovedWrappers();
      if (npWasMoved && this._npWrapper) {
        this._npWrapper.style.setProperty('position', 'relative', 'important');
        this._npWrapper.style.setProperty('z-index', '51', 'important');
      }
      const headerEl      = this._headerEl;
      this._headerEl      = null;
      const headerWrapper = this._headerWrapper;
      this._headerWrapper = null;
      for (const bc of this._badgeShadowCards) {
        bc.style.removeProperty('box-shadow');
        bc.style.removeProperty('background');
        bc.style.removeProperty('backdrop-filter');
        bc.style.removeProperty('-webkit-backdrop-filter');
      }
      this._badgeShadowCards = [];
      if (this._badgeRowEl) {
        this._badgeRowEl.style.removeProperty('background');
        this._badgeRowEl.style.removeProperty('backdrop-filter');
        this._badgeRowEl.style.removeProperty('-webkit-backdrop-filter');
        this._badgeRowEl.style.removeProperty('box-shadow');
        this._badgeRowEl.style.setProperty('z-index', '51', 'important');
      }
      const badgeRowEl = this._badgeRowEl;
      this._badgeRowEl = this._badgeRowWrapper = null;

      const scalableEls = this._scalableEls;
      this._scalableEls = [];

      overlayEl.style.overflow   = '';
      overlayEl.style.pointerEvents = 'none';
      overlayEl.style.clipPath   = 'inset(0%)';
      overlayEl.style.transition = `opacity 0.22s ${EASE_OUT}, transform 0.30s ${EASE_OUT}, clip-path 0.32s ${EASE_OUT}`;
      overlayEl.style.opacity    = '0';
      overlayEl.style.transform  = 'translateY(40%)';
      overlayEl.style.clipPath   = 'inset(6% round 22px)';

      this._pendingBlurFade = { blurEl, overlayEl, scalableEls, headerEl, badgeRowEl, headerWrapper,
        npWrappers: npWasMoved ? [this._npWrapper] : [] };

      // Call the service first, so its round trip overlaps the blur fade.
      window._casoraNoFilterAnim = true;
      try {
        if (window._casoraFilter) {
          window._casoraFilter.set('all');
          window._casoraFilter.share(this._rawHass || this._hass, 'all');
        } else this._hass.callService('input_select', 'select_option', {
          entity_id: 'input_select.casora_mobile_filter',
          option: 'all',
        });
      } catch (_) {}

      this._runBlurFade();
    }

    _runBlurFade() {
      const args = this._pendingBlurFade;
      if (!args) return;
      this._pendingBlurFade = null;
      if (this._showing) return;

      const { blurEl, overlayEl, scalableEls = [], headerEl, badgeRowEl, headerWrapper,
        npWrappers = [] } = args;
      const scalableSet   = new Set(scalableEls);
      const npHoldSet     = new Set(npWrappers.filter(Boolean));
      const animContainer = this._container; // capture before cleanup nulls it
      const outerHost     = animContainer ? animContainer.host : null;

      const restoreDisplaySet = new Set();
      for (let i = 0; i < scalableEls.length; i++) {
        const el = scalableEls[i];
        if (el.querySelector?.('casora-smart-row')) {
          restoreDisplaySet.add(el);
          if (i > 0) restoreDisplaySet.add(scalableEls[i - 1]); // its section header
        }
      }

      const zoomHeaderSet = new Set();
      for (const el of scalableEls) {
        if (el === headerWrapper) continue;
        const t = el.querySelector?.('button-card')?._config?.template;
        const isHdr = (n) => t === n || (Array.isArray(t) && t.includes(n));
        if (isHdr('casora_mobile_header')) {
          zoomHeaderSet.add(el);
        }
      }

      if (!_activeOverlay) {
      for (const wrapper of (this._suppressedWrappers || [])) {
        if (!scalableSet.has(wrapper)) {
          wrapper.style.removeProperty('opacity');
          wrapper.style.removeProperty('pointer-events');
          const isInOuter = wrapper.getRootNode() === animContainer;
          if (!isInOuter && wrapper.style.display === 'none' && _restorable(wrapper)) wrapper.style.display = '';
        }
      }

      for (const hsr of (window._casoraSmartRows || [])) {
        if (hsr.style.display === 'none' && _restorable(hsr)) hsr.style.display = '';
        hsr.style.removeProperty('opacity');
        hsr.style.removeProperty('pointer-events');
        const sr = hsr.shadowRoot;
        if (!sr) continue;
        const isOuter = hsr === outerHost;
        for (const w of sr.querySelectorAll('.card-wrapper')) {
          if (!scalableSet.has(w)) {
            w.style.removeProperty('opacity');
            w.style.removeProperty('pointer-events');
            if (!isOuter && w.style.display === 'none' && _restorable(w)) w.style.display = '';
          }
        }
      }

      const snapRows = this._hiddenSmartRows;
      this._hiddenSmartRows = [];
      for (const hsr of snapRows) {
        hsr.style.removeProperty('opacity');
        hsr.style.removeProperty('pointer-events');
        hsr.style.removeProperty('transition');
        if (hsr.style.display === 'none' && _restorable(hsr)) hsr.style.display = '';
      }

      // ── Reveal: snap all wrappers visible, animate only the blur layer ─────────
      if (headerEl) headerEl.style.removeProperty('visibility');
      for (const el of scalableEls) {
        if (el === headerWrapper) continue;   // animated separately with zoom
        if (npHoldSet.has(el))    continue;   // held visible, no reveal motion
        el.style.removeProperty('opacity');
        el.style.removeProperty('pointer-events');
        el.style.transition = 'none';
        if (zoomHeaderSet.has(el)) {
          el.style.opacity         = '0';
          el.style.transformOrigin = '50% 30%';
          el.style.transform       = 'scale(0.93) translateY(20px)';
        } else {
          el.style.opacity         = '1';
          el.style.transformOrigin = '50% 30%';
          el.style.transform       = 'scale(0.93) translateY(20px)';
        }
        if (el.style.display === 'none' && restoreDisplaySet.has(el) && _restorable(el)) el.style.display = '';
      }

      const mo = new MutationObserver((mutations) => {
        if (this._showing || _activeOverlay) { mo.disconnect(); return; }
        for (const mut of mutations) {
          const t = mut.target;
          if (t.style.display === 'none' && _restorable(t)) t.style.display = '';
          // Leave !important alone: it is the suppression stamp.
          if (t.style.opacity === '0' && !t.style.getPropertyPriority('opacity')) {
            t.style.removeProperty('opacity');
            t.style.removeProperty('pointer-events');
          }
          if (t.style.height === '0px' || t.style.height === '0') {
            t.style.transition = 'none';
            t.style.removeProperty('height');
            t.style.removeProperty('overflow');
          }
        }
      });
      for (const hsr of (window._casoraSmartRows || [])) {
        mo.observe(hsr, { attributes: true, attributeFilter: ['style'] });
        const sr = hsr.shadowRoot;
        if (sr) for (const w of sr.querySelectorAll('.card-wrapper')) {
          mo.observe(w, { attributes: true, attributeFilter: ['style'] });
        }
      }
      setTimeout(() => mo.disconnect(), 560);
      } // end dashboard-reveal block

      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (this._showing) return;
        blurEl.style.transition = `opacity 0.50s ${EASE_OUT}`;
        blurEl.style.opacity    = '0';
        if (_activeOverlay) return;
        _showChromePill();
        // Header springs in from a zoomed-out/below position.
        if (headerWrapper) {
          headerWrapper.style.transition = `transform 0.62s ${SPRING_IN}, opacity 0.50s ${EASE_OUT}`;
          headerWrapper.style.transform  = 'scale(1) translateY(0px)';
          headerWrapper.style.opacity    = '1';
        }
        // Section header text springs in with the same depth motion.
        for (const el of zoomHeaderSet) {
          el.style.transition = `transform 0.62s ${SPRING_IN}, opacity 0.50s ${EASE_OUT}`;
          el.style.transform  = 'scale(1) translateY(0px)';
          el.style.opacity    = '1';
        }
        // Entity rows spring too - transform only, opacity untouched.
        for (const el of scalableEls) {
          if (el === headerWrapper || zoomHeaderSet.has(el)) continue;
          if (npHoldSet.has(el)) continue; // NP: held visible, no spring
          el.style.transition = `transform 0.62s ${SPRING_IN}`;
          el.style.transform  = 'scale(1) translateY(0px)';
        }
      }));

      const sweepReHidden = () => {
        if (this._showing || _activeOverlay) return;
        for (const hsr of (window._casoraSmartRows || [])) {
          if (hsr.style.display === 'none' && _restorable(hsr)) hsr.style.display = '';
          hsr.style.removeProperty('opacity');
          hsr.style.removeProperty('pointer-events');
          const sr = hsr.shadowRoot;
          if (!sr) continue;
          const isOuter = hsr === outerHost;
          for (const w of sr.querySelectorAll('.card-wrapper')) {
            if (!scalableSet.has(w)) {
              w.style.removeProperty('opacity');
              w.style.removeProperty('pointer-events');
              if (!isOuter) {
                w.style.removeProperty('height');
                w.style.removeProperty('overflow');
                w.style.removeProperty('transition');
                if (w.style.display === 'none' && _restorable(w)) w.style.display = '';
              }
            } else if (w.style.display === 'none' && restoreDisplaySet.has(w)) {
              if (_restorable(w)) w.style.display = '';
            }
          }
        }
      };
      for (const delay of [250, 400, 750]) setTimeout(sweepReHidden, delay);

      // Cleanup, just after the 500ms blur fade finishes.
      setTimeout(() => {
        if (this._showing) return;
        blurEl.style.display    = 'none';
        blurEl.style.transition = 'none';
        blurEl.style.opacity    = '1';
        overlayEl.style.display    = 'none';
        overlayEl.style.transition = 'none';
        overlayEl.style.transform  = 'translateY(100%)';
        overlayEl.style.clipPath   = '';
        overlayEl.style.opacity    = '1';
        overlayEl.style.overflow   = '';
        if (badgeRowEl && !_activeOverlay) {
          badgeRowEl.style.removeProperty('z-index');
          badgeRowEl.style.removeProperty('position');
          badgeRowEl.style.removeProperty('top');
          badgeRowEl.style.removeProperty('left');
          badgeRowEl.style.removeProperty('right');
          badgeRowEl.style.removeProperty('width');
          badgeRowEl.style.removeProperty('transform');
          badgeRowEl.style.removeProperty('transition');
        }
        if (!_activeOverlay) { try { _dashHeader?.update(); } catch (_) {} }
        for (const w of npWrappers) {
          if (!w) continue;
          w.style.removeProperty('z-index');
          w.style.removeProperty('position');
        }
        for (const w of Array.from(this._contentEl?.children || [])) {
          if (w._animIndex !== undefined) {
            w.style.transition = 'none';
            w.style.transform  = '';
            w.style.opacity    = '0';
          }
        }
        if (this._contentEl) {
          this._contentEl.style.visibility = '';
          this._contentEl.style.paddingTop = '';
        }
        this._container = this._selfWrapper = null;
        _dashHeader?.update();
      }, 560);

      setTimeout(() => {
        if (this._showing) return;
        for (const el of scalableEls) {
          el.style.removeProperty('transition');
          el.style.removeProperty('opacity');
          el.style.removeProperty('pointer-events');
          el.style.removeProperty('transform');
          el.style.removeProperty('transform-origin');
        }
        if (headerWrapper) {
          headerWrapper.style.removeProperty('transform');
          headerWrapper.style.removeProperty('transform-origin');
          headerWrapper.style.removeProperty('transition');
          headerWrapper.style.removeProperty('opacity');
          headerWrapper.style.removeProperty('pointer-events');
        }
      }, 700);

      setTimeout(() => {
        if (this._showing || _activeOverlay) return;
        window._casoraNoFilterAnim = false;
        if (animContainer) {
          animContainer.style.removeProperty('--casora-anim-name');
          animContainer.style.removeProperty('--casora-anim-duration');
          animContainer.style.removeProperty('--casora-anim-delay');
        }
      }, 4000);
    }

    _copyThemeVars(source) {
      if (!source || !this._overlayEl) return;
      try {
        const cs = window.getComputedStyle(source);
        for (const v of CASORA_VARS) {
          const val = cs.getPropertyValue(v)?.trim();
          if (val) this._overlayEl.style.setProperty(v, val);
        }
        this._overlayEl.style.setProperty('--ha-card-backdrop-filter', 'none');
      } catch (_) {}
    }

    _getBC(el) {
      if (!el) return null;
      if (el.tagName?.toLowerCase() === 'button-card') return el;
      return el.querySelector?.('button-card') || null;
    }

    _findContainerAndSelf() {
      let el = this;
      while (el.parentElement) {
        const parent = el.parentElement;
        for (const sib of parent.children) {
          if (sib === el) continue;
          if (this._getBC(sib)) return { container: parent, self: el };
        }
        el = parent;
      }
      return null;
    }

    _discoverElements() {
      this._container = this._selfWrapper = this._badgeRowEl = this._badgeRowWrapper =
        this._headerEl = this._subBadgesEl = this._subBadgesWrapper = null;

      const found = this._findContainerAndSelf();
      if (!found) return;

      const { container, self } = found;
      this._container   = container;
      this._selfWrapper = self;

      const kids    = Array.from(container.children);
      const selfIdx = kids.indexOf(self);

      for (let i = selfIdx - 1; i >= 0; i--) {
        const bc = this._getBC(kids[i]);
        if (!bc) continue;
        try {
          const pos = window.getComputedStyle(bc).position;
          if (pos === 'sticky' || pos === '-webkit-sticky') {
            this._badgeRowEl = bc; this._badgeRowWrapper = kids[i]; break;
          }
        } catch (_) {}
      }

      if (this._badgeRowWrapper) {
        const brIdx = kids.indexOf(this._badgeRowWrapper);
        for (let i = 0; i < brIdx; i++) {
          const bc = this._getBC(kids[i]);
          if (bc) this._headerEl = bc;
        }
      }

      for (let i = selfIdx + 1; i < kids.length; i++) {
        const bc = this._getBC(kids[i]);
        if (bc) { this._subBadgesEl = bc; this._subBadgesWrapper = kids[i]; break; }
      }

      this._npWrapper = null;
      if (this._subBadgesWrapper) {
        const sbIdx = kids.indexOf(this._subBadgesWrapper);
        for (let i = sbIdx + 1; i < kids.length; i++) {
          const bc = this._getBC(kids[i]);
          const t  = bc?._config?.template;
          const has = (name) => t === name || (Array.isArray(t) && t.includes(name));
          if (has('casora_mobile_now_playing')) { this._npWrapper = _npTraceTarget = kids[i]; break; }
          if (has('casora_mobile_header')) break; // reached Favorites/rooms
        }
      }

      if (this._selfWrapper && !this._selfWrapper._casoraOutOfFlow) {
        this._selfWrapper._casoraOutOfFlow = true;
        this._selfWrapper.style.setProperty('position', 'absolute', 'important');
        this._selfWrapper.style.setProperty('width',    '0', 'important');
        this._selfWrapper.style.setProperty('height',   '0', 'important');
        this._selfWrapper.style.setProperty('overflow', 'hidden', 'important');
        this._selfWrapper.style.setProperty('margin',   '0', 'important');
      }
    }

    _restoreMovedWrappers() {
      // Now Playing first: the sub-badges' saved sibling is its wrapper.
      if (this._npSaved) {
        const { parent, sibling } = this._npSaved;
        this._npSaved = null;
        const w = this._npWrapper;
        if (w) {
          w.style.removeProperty('width');
          w.style.removeProperty('margin-top');
          w.style.removeProperty('padding-left');
          w.style.removeProperty('transition');
          if (parent) {
            if (sibling && sibling.parentNode === parent) parent.insertBefore(w, sibling);
            else parent.appendChild(w);
          }
          w.style.removeProperty('opacity');
          w.style.removeProperty('pointer-events');
          const bc = this._getBC(w);
          if (bc && this._hass) { try { bc.hass = this._hass; } catch (_) {} }
        }
      }
      this._npSpacer?.remove();
      this._npSpacer = null;
      if (this._subBadgesWrapper) {
        // Restore the dashboard's phantom-gap suppression (see _animIn).
        this._subBadgesWrapper.setAttribute('data-collapsed-spacer', '1');
        this._subBadgesWrapper.style.removeProperty('display');
        this._subBadgesWrapper.style.removeProperty('width');
        this._subBadgesWrapper.style.removeProperty('margin-top');
        this._subBadgesWrapper.style.removeProperty('--badge-background');
        this._subBadgesWrapper.style.removeProperty('--badge-blur');
        this._subBadgesWrapper.style.removeProperty('padding-left');
        if (this._subBadgesSavedParent) {
          const sib = this._subBadgesSavedSibling;
          if (sib && sib.parentNode === this._subBadgesSavedParent) {
            this._subBadgesSavedParent.insertBefore(this._subBadgesWrapper, sib);
          } else {
            this._subBadgesSavedParent.appendChild(this._subBadgesWrapper);
          }
          const bc = this._getBC(this._subBadgesWrapper);
          if (bc && this._hass) { try { bc.hass = this._hass; } catch (_) {} }
        }
      }
      this._subBadgesEl = this._subBadgesWrapper = null;
      this._subBadgesSavedParent = this._subBadgesSavedSibling = null;
    }

    // Shadow DOM section/entity wrappers - scaled during open for depth effect
    _findScalableEls() {
      if (!this._container) return [];
      const kids  = Array.from(this._container.children);
      const pivot = this._subBadgesWrapper || this._selfWrapper;
      if (!pivot) return [];
      const idx = kids.indexOf(pivot);
      return idx >= 0 ? kids.slice(idx + 1) : [];
    }

    // ── Animate In ─────────────────────────────────────────────────────────────

    _animIn() {
      const blurEl    = this._blurLayerEl;
      const overlayEl = this._overlayEl;
      if (!blurEl || !overlayEl) return;
      // #9: Frames/Timer dieses Zeigens wirken nur, solange es noch dasselbe Overlay ist. Wird das
      // Overlay dazwischen ab- und angehängt (Neuaufbau der Reihe), hat es eine neue Hintergrundebene;
      // ein alter Frame setzte sonst „alle anderen Ebenen“ – also die neue eigene – auf unsichtbar.
      const live = () => this._showing && this._blurLayerEl === blurEl;

      const prevOverlay = _activeOverlay;
      _activeOverlay = this;
      _dashHeader?.hide();
      _hideChromePill();
      _restoreBadgeRow();
      if (prevOverlay && prevOverlay !== this) prevOverlay._restoreMovedWrappers();
      this._restoreMovedWrappers();
      this._discoverElements();
      this._copyThemeVars(this._headerEl || this._badgeRowEl || null);

      // Clear animation suppression left by the previous dismiss.
      for (const wrapper of (this._suppressedWrappers || [])) {
        wrapper.style.removeProperty('--casora-anim-name');
        wrapper.style.removeProperty('--casora-anim-duration');
        wrapper.style.removeProperty('--casora-anim-delay');
      }
      this._suppressedWrappers = [];
      for (const hsr of (this._hiddenSmartRows || [])) {
        hsr.style.removeProperty('opacity');
        hsr.style.removeProperty('pointer-events');
        hsr.style.removeProperty('transition');
      }
      this._hiddenSmartRows = [];

      const headerWrapper = this._headerEl && this._container
        ? Array.from(this._container.children).find(k => k.contains(this._headerEl))
        : null;
      this._scalableEls   = [
        ...(headerWrapper ? [headerWrapper] : []),
        ...this._findScalableEls(),
      ];
      for (const w of this._scalableEls) {
        w.style.removeProperty('transition');
        w.style.removeProperty('transform');
        w.style.removeProperty('transform-origin');
      }
      headerWrapper?.style.removeProperty('opacity');
      headerWrapper?.style.removeProperty('pointer-events');
      this._headerWrapper = headerWrapper;

      const badgeNaturalTop = this._config?.room
        ? null : _measureBadgeNaturalTop(this._badgeRowEl);

      window._casoraNoFilterAnim = true;
      for (const hsr of (window._casoraSmartRows || [])) {
        const sr = hsr.shadowRoot;
        if (sr) {
          for (const wrapper of sr.querySelectorAll('.card-wrapper')) {
            if (wrapper === this._badgeRowWrapper && !this._config?.room) continue;
            if (this._headerEl && wrapper.contains(this._headerEl)) continue;
            if (this._subBadgesWrapper && wrapper === this._subBadgesWrapper) continue;
            if (this._config?.filter_category === 'media' &&
                wrapper === this._npWrapper) continue;
            wrapper.style.setProperty('--casora-anim-name',     'none');
            wrapper.style.setProperty('--casora-anim-duration', '0.001s');
            wrapper.style.setProperty('--casora-anim-delay',    '-1s');
            wrapper.style.setProperty('opacity', '0', 'important');
            wrapper.style.setProperty('pointer-events', 'none', 'important');
            this._suppressedWrappers.push(wrapper);
          }
        }
      }
      if (this._container) {
        this._container.style.setProperty('--casora-anim-name',     'none');
        this._container.style.setProperty('--casora-anim-duration', '0.001s');
        this._container.style.setProperty('--casora-anim-delay',    '-1s');
      }

      const TITLE_FONT_PX = 34;
      const TITLE_PAD_BOT = 12;

      const npRect0 = (this._config?.filter_category === 'media' && this._npWrapper)
        ? this._npWrapper.getBoundingClientRect() : null;
      const npNaturalTop = (npRect0 && npRect0.height > 4) ? npRect0.top : null;
      this._npNaturalTop = npNaturalTop; // engage() re-verifies at settle time

      const nameSrcEl  = this._headerEl?.shadowRoot?.querySelector('#name');
      const nameRect   = nameSrcEl?.getBoundingClientRect();

      const filterState = this._hass?.states?.['input_select.casora_mobile_filter']?.state;
      const CATEGORY_TITLES = { presence: 'Personen', climate: 'Klima', lights: 'Beleuchtung', security: 'Sicherheit', energy: 'Energie', media: 'Medien', scenes: 'Szenen', other: 'Sonstiges' }; // casora-local-patch
      const titleText   = this._config?.room
        ? this._config.room
        : (!filterState || filterState === 'all' ? (window.casoraTr ? window.casoraTr('Zuhause') : 'Zuhause')
          : (CATEGORY_TITLES[filterState] || filterState.charAt(0).toUpperCase() + filterState.slice(1)));
      const titleEl = document.createElement('div');
      titleEl.style.cssText = [
        'display:block', 'width:100%', 'box-sizing:border-box',
        `padding-bottom:${TITLE_PAD_BOT}px`,
        `font-size:${TITLE_FONT_PX}px`, 'font-weight:700', 'color:var(--casora-mobile-title-color, #ffffff)',
        'letter-spacing:-0.5px', 'pointer-events:none',
        'transform-origin:left center',
      ].join(';');
      titleEl.style.setProperty('margin-top',
        `calc(env(safe-area-inset-top, 0px) + 52px + calc(12px * var(${LANDSCAPE_PHONE_VAR}, 0)))`);
      titleEl.style.setProperty('padding-left',
        `calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})`);
      if (nameSrcEl && nameRect?.height) {
        const ncs = getComputedStyle(nameSrcEl);
        if (ncs.fontSize)      titleEl.style.fontSize      = ncs.fontSize;
        if (ncs.lineHeight)    titleEl.style.lineHeight    = ncs.lineHeight;
        if (ncs.letterSpacing) titleEl.style.letterSpacing = ncs.letterSpacing;
      }
      titleEl.textContent = titleText;
      this._titleEl = titleEl;

      this._backBtn?.remove();
      this._backBtn = null;
      {
        if (!overlayEl.querySelector('#casora-back-glass-style')) {
          const st = document.createElement('style');
          st.id = 'casora-back-glass-style';
          st.textContent =
            '.casora-back-glass::before{content:"";position:absolute;inset:0;' +
            'display:var(--casora-back-rim, block);' +
            'border-radius:50%;padding:1.4px;' +
            // Subtle: the rim should melt into the background, not glint.
            'background:conic-gradient(from 0deg,' +
            'rgba(255,255,255,0.55) 0deg,rgba(255,255,255,0.12) 55deg,' +
            'rgba(255,255,255,0.02) 90deg,rgba(255,255,255,0.12) 130deg,' +
            'rgba(255,255,255,0.30) 175deg 185deg,rgba(255,255,255,0.12) 230deg,' +
            'rgba(255,255,255,0.02) 270deg,rgba(255,255,255,0.12) 305deg,' +
            'rgba(255,255,255,0.55) 360deg);' +
            '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
            '-webkit-mask-composite:xor;' +
            'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
            'mask-composite:exclude;pointer-events:none;}' +
            // Side wraps: a crisp dark hairline, not a soft band.
            '.casora-back-glass::after{content:"";position:absolute;inset:-1px;' +
            'display:var(--casora-back-rim, block);' +
            'border-radius:50%;padding:1px;' +
            'background:conic-gradient(from 0deg,' +
            'transparent 0deg 50deg,rgba(0,0,0,0.32) 80deg 100deg,' +
            'transparent 130deg 230deg,rgba(0,0,0,0.32) 260deg 280deg,' +
            'transparent 310deg 360deg);' +
            '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
            '-webkit-mask-composite:xor;' +
            'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
            'mask-composite:exclude;pointer-events:none;}' +
            '.casora-back-glass:active{transform:scale(0.94);}' +
            '.casora-back-glass{transition:transform 0.15s ease;}';
          overlayEl.appendChild(st);
        }
        const back = document.createElement('div');
        back.className = 'casora-back-glass';
        back.style.cssText = [
          'position:fixed',
          `left:calc(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + ${LANDSCAPE_GUTTER_CALC})`,
          `top:calc(env(safe-area-inset-top, 0px) + 4px + calc(12px * var(${LANDSCAPE_PHONE_VAR}, 0)))`,
          'width:40px', 'height:40px', 'border-radius:50%',
          'display:flex', 'align-items:center', 'justify-content:center',
          'background-image:var(--casora-back-highlight, radial-gradient(140% 90% at 50% -20%,' +
            'rgba(255,255,255,0.14), rgba(255,255,255,0.04) 45%, transparent 62%))',
          'background-color:var(--casora-chrome-fill, rgba(255,255,255,0.07))',
          'backdrop-filter:blur(10px) saturate(1.2)',
          '-webkit-backdrop-filter:blur(10px) saturate(1.2)',
          'cursor:pointer', 'z-index:61',
        ].join(';');
        back.innerHTML =
          '<svg width="14" height="24" viewBox="0 0 14 24" fill="none" style="margin-right:2px">' +
          '<path d="M12 2.5 L2.8 12 L12 21.5" style="stroke:var(--casora-chrome-ink, #fff)" stroke-width="3" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>';
        back.addEventListener('click', (e) => { e.stopPropagation(); this._dismiss(); });
        this._backBtn = back;
      }

      this._compactHeaderEl?.remove();
      const compactEl = document.createElement('div');
      compactEl.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:60',
        `height:${COMPACT_BAR_HEIGHT}px`,
        'padding-top:env(safe-area-inset-top, 0px)',
        'box-sizing:content-box',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:17px', 'font-weight:600', 'color:var(--casora-mobile-title-color, #ffffff)', 'letter-spacing:-0.2px',
        'opacity:0', 'transform:translateY(5px)', 'pointer-events:none',
      ].join(';');
      compactEl.textContent = titleText;
      // H3 (Weich-Audit): Weich legt unter den kleinen Raumtitel eine Leinenfläche, die nach unten
      // ausläuft – gescrollte Kacheln und Szenen liefen sonst sichtbar hinter „‹ Raumname“ durch.
      // Sie blendet mit dem Titel ein (gleiche Deckkraft). Andere Designs: unverändert.
      if (window._casoraSoft && window._casoraSoft()) {
        const fill = document.createElement('div');
        fill.style.cssText = [
          'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:60', 'pointer-events:none', 'opacity:0',
          `height:calc(env(safe-area-inset-top, 0px) + ${COMPACT_BAR_HEIGHT + 22}px)`,
          'background:linear-gradient(to bottom, var(--casora-room-head-fill, rgba(244,239,231,0.94)) 0%,'
            + ' var(--casora-room-head-fill, rgba(244,239,231,0.94)) calc(100% - 22px),'
            + ' transparent 100%)',
        ].join(';');
        // In der Ebene des Raums (wie der Zurück-Knopf, z-index 61), damit sie den Knopf nicht abdeckt.
        (this._overlayEl || this._appendTarget || document.body).appendChild(fill);
        this._headFillEl?.remove();
        this._headFillEl = fill;
      }
      compactEl.addEventListener('click', () => {
        this._overlayEl?.scrollTo({ top: 0, behavior: 'smooth' });
      });
      (this._appendTarget || document.body).appendChild(compactEl);
      this._compactHeaderEl = compactEl;


      // Hide the original header so the overlay title doesn't double up.
      if (this._headerEl) {
        this._headerEl.style.setProperty('visibility', 'hidden', 'important');
      }

      if (this._subBadgesWrapper) {
        // Weich (--casora-badge-circle-on: 1): Unter-Badges behalten ihre Pille wie die
        // Haupt-Badges – durchsichtig stand die Schrift direkt auf dem hellen Foto.
        // Andere Designs: durchsichtig wie bisher.
        const soft = getComputedStyle(this._subBadgesWrapper)
          .getPropertyValue('--casora-badge-circle-on').trim() === '1';
        if (soft) {
          this._subBadgesWrapper.style.removeProperty('--badge-background');
          this._subBadgesWrapper.style.removeProperty('--badge-blur');
        } else {
          this._subBadgesWrapper.style.setProperty('--badge-background', 'transparent');
          this._subBadgesWrapper.style.setProperty('--badge-blur', '0px');
        }
      }

      // Auto sections first (rooms), then Favorites prepends itself in front.
      this._ensureAutoSections();
      this._ensureFavoritesPopupSection();

      // Active cards first, before anything becomes visible.
      this._sortSectionGrids();

      requestAnimationFrame(() => {
        if (!live()) return;
        if (this._config?.room) {
          setTimeout(() => this._settleRoom(0), 250);
          // Beim Öffnen sind die Kacheln oft noch nicht gezeichnet – dann zählt nur der Zustand der
          // Entität. Gezeichnet melden sie selbst, ob sie aktiv sind (Drucker fehlgeschlagen,
          // Gerät läuft …): danach noch einmal sortieren (Issue #6).
          setTimeout(() => { if (this._showing) this._sortSectionGrids(); }, 700);
        }

        overlayEl.style.transform = 'translateY(0)';
        overlayEl.style.display   = 'block';
        overlayEl.style.pointerEvents = '';

        this._badgeShadowCards = [];
        const _tryBadgeShadows = (attempt) => {
          if (!live()) return;
          const badgeSR = this._badgeRowEl?.shadowRoot;
          if (!badgeSR) return;
          const badges = Array.from(badgeSR.querySelectorAll('button-card'));
          if (badges.length === 0 && attempt < 8) {
            setTimeout(() => _tryBadgeShadows(attempt + 1), 80);
            return;
          }
          this._badgeShadowCards = [];
          for (const badge of badges) {
            const bCard = badge.shadowRoot?.querySelector('ha-card');
            if (!bCard) continue;
            const bg  = getComputedStyle(bCard).backgroundColor;
            const m   = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            const lum = m ? (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 : 0;
            bCard.style.setProperty('box-shadow',
              lum > 0.45
                ? '0 6px 20px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.28)'
                : '0 0 22px 4px rgba(255,255,255,0.4), 0 0 8px 1px rgba(255,255,255,0.2)',
              'important');
            if (lum <= 0.45) bCard.style.setProperty('background', BADGE_INACTIVE_BG, 'important');
            this._badgeShadowCards.push(bCard);
          }
        };
        _tryBadgeShadows(0);

        const useSubBadges = this._subBadgesWrapper
          && this._config?.filter_category !== 'presence';
        if (useSubBadges) {
          this._subBadgesSavedParent  = this._subBadgesWrapper.parentNode;
          this._subBadgesSavedSibling = this._subBadgesWrapper.nextSibling;
          this._subBadgesWrapper.removeAttribute('data-collapsed-spacer');
          this._subBadgesWrapper.style.setProperty('display',    'block', 'important');
          this._subBadgesWrapper.style.setProperty('width',      '100%', 'important');
          this._subBadgesWrapper.style.setProperty('margin-top',
            this._config?.room ? '6px' : '16px', 'important');
          this._subBadgesWrapper.style.setProperty('padding-left', LANDSCAPE_GUTTER_CALC, 'important');
        }

        this._contentEl.style.visibility = '';
        this._contentEl.style.paddingTop = '0';
        if (useSubBadges) {
          this._contentEl.insertBefore(this._subBadgesWrapper, this._contentEl.firstChild);
        }
        this._contentEl.insertBefore(this._titleEl, this._contentEl.firstChild);
        if (this._backBtn) overlayEl.appendChild(this._backBtn);
        this._gapSpacer?.remove();
        this._gapSpacer = null;
        if (_movedBadgeRow && _movedBadgeRow.owner !== this) {
          _restoreBadgeRow();
        }
        const noBadge = !!this._config?.room;
        if (!noBadge && this._badgeRowWrapper && this._badgeRowEl &&
            this._compactHeaderEl && !_movedBadgeRow) {
          const badgeW  = this._badgeRowWrapper;
          const badgeEl = this._badgeRowEl;
          const hdrRect = this._compactHeaderEl.getBoundingClientRect();
          const lockTop = hdrRect.bottom + BADGE_LOCK_GAP;
          const pillBf  = window.getComputedStyle(badgeEl)
            .getPropertyValue('--ha-card-backdrop-filter').trim();
          _movedBadgeRow = {
            owner: this, wrapper: badgeW, el: badgeEl,
            parent: badgeW.parentNode, sibling: badgeW.nextSibling,
          };
          badgeEl.style.removeProperty('transform');
          badgeEl.style.removeProperty('transition');
          badgeEl.style.setProperty('position', 'relative', 'important');
          badgeEl.style.setProperty('top',      '0',        'important');
          badgeEl.style.removeProperty('left');
          badgeEl.style.removeProperty('right');
          badgeEl.style.removeProperty('width');
          badgeW.style.removeProperty('opacity');
          badgeW.style.removeProperty('pointer-events');
          badgeW.style.setProperty('position',   'sticky',       'important');
          badgeW.style.setProperty('top',        `${lockTop}px`, 'important');
          badgeW.style.setProperty('z-index',    '30',           'important');
          // Lands the pills at the dashboard badge row's resting position.
          badgeW.style.setProperty('margin-top', '10px',         'important');
          badgeW.style.setProperty('padding-left', LANDSCAPE_GUTTER_CALC, 'important');
          if (pillBf) badgeW.style.setProperty('--ha-card-backdrop-filter', pillBf);
          const badgesScroller = badgeEl.shadowRoot?.querySelector('#badges');
          const badgesSL       = badgesScroller ? badgesScroller.scrollLeft : 0;
          this._contentEl.insertBefore(badgeW, this._titleEl.nextSibling);
          if (badgesScroller && badgesSL) badgesScroller.scrollLeft = badgesSL;
          if (!useSubBadges) {
            const sp = document.createElement('div');
            sp.style.cssText = 'height:24px;';
            this._contentEl.insertBefore(sp, badgeW.nextSibling);
            this._gapSpacer = sp;
          }
        } else if (!useSubBadges) {
          // No badge row, so the same gap without the pills.
          const sp = document.createElement('div');
          sp.style.cssText = 'height:24px;';
          this._contentEl.insertBefore(sp, this._titleEl.nextSibling);
          this._gapSpacer = sp;
        }

        const seamlessNp = this._config?.filter_category === 'media' && npNaturalTop != null;
        overlayEl.style.transition = 'none';
        overlayEl.style.transform  = 'translateY(0)';
        overlayEl.style.clipPath   = '';
        overlayEl.style.opacity    = seamlessNp ? '1' : '0';
        overlayEl.style.overflowY = 'auto';
        overlayEl.style.overflowX = 'hidden';
        overlayEl.style.display   = 'block';
        overlayEl.scrollTop       = 0;

        if (this._config?.filter_category === 'media' && npNaturalTop != null &&
            this._npWrapper && this._subBadgesWrapper) {
          this._npSaved = {
            parent:  this._npWrapper.parentNode,
            sibling: this._npWrapper.nextSibling,
          };
          this._npWrapper.style.setProperty('width', '100%', 'important');
          this._npWrapper.style.setProperty('padding-left', LANDSCAPE_GUTTER_CALC, 'important');
          this._npWrapper.style.removeProperty('margin-top');
          this._npWrapper.style.setProperty('transition', 'none', 'important');
          this._contentEl.insertBefore(this._npWrapper, this._subBadgesWrapper.nextSibling);
        }

        const badgeAdopted = !!(badgeNaturalTop && _movedBadgeRow?.owner === this &&
          this._badgeRowWrapper?.parentNode === this._contentEl);
        if (badgeAdopted) {
          _alignAdoptedBadgeRow(this._badgeRowWrapper, this._badgeRowEl, badgeNaturalTop);
        }

        for (const w of [this._subBadgesWrapper, this._npWrapper]) {
          if (!w) continue;
          if (w !== this._npWrapper || this._config?.filter_category === 'media') {
            w.style.removeProperty('opacity');
            w.style.removeProperty('pointer-events');
          }
          const bc = this._getBC(w);
          if (bc && this._hass) {
            try { bc.hass = this._hass; } catch (_) {}
            _flushRender(bc);
          }
        }

        const npAdopted = seamlessNp && !isLandscapePhone() &&
          this._npWrapper?.parentNode === this._contentEl;
        if (npAdopted) _alignAdoptedEl(this._npWrapper, npNaturalTop, 160);

        if (badgeAdopted || npAdopted) {
          requestAnimationFrame(() => {
            if (!live()) return;
            if (badgeAdopted && _movedBadgeRow?.owner === this &&
                this._badgeRowWrapper?.parentNode === this._contentEl) {
              _alignAdoptedBadgeRow(this._badgeRowWrapper, this._badgeRowEl,
                badgeNaturalTop, 4, NP_LATE_DEAD_ZONE);
            }
            if (npAdopted && this._npWrapper?.parentNode === this._contentEl) {
              _alignAdoptedEl(this._npWrapper, npNaturalTop, 12, NP_LATE_DEAD_ZONE);
            }
          });
        }

        if (seamlessNp) {
          this._titleEl.style.opacity = '0';
          if (this._subBadgesWrapper) this._subBadgesWrapper.style.opacity = '0';
        }

        blurEl.style.transition    = 'none';
        const seamlessSwitch       = _otherBlurUp(blurEl);
        blurEl.style.opacity       = seamlessSwitch ? '1' : '0';
        blurEl.style.display       = 'block';
        if (seamlessSwitch) {
          blurEl.style.background = 'transparent';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            blurEl.style.background = this._blurLayerRoomBg || 'var(--casora-filter-veil, rgba(0, 0, 0, 0.22))'; // casora-local-patch
            if (!live()) return;
            for (const el of _blurLayers) {
              if (el === blurEl) continue;
              el.style.transition = 'none';
              el.style.opacity    = '0';
            }
          }));
        }
        // Entity sections start below the viewport, ready to slide up.
        const vhPx = window.innerHeight || 800;
        for (const w of Array.from(this._contentEl?.children || [])) {
          if (w._animIndex !== undefined) {
            w.style.transition = 'none';
            w.style.transform  = `translateY(${vhPx}px)`;
            w.style.opacity    = '1';
          }
        }

        // Blur fades in, overlay fades in, entity sections slide up.
        requestAnimationFrame(() => {
          if (!live()) return;

          blurEl.style.transition    = `opacity 0.30s ease`;
          blurEl.style.opacity       = '1';

          if (headerWrapper) {
            headerWrapper.style.transition      = `transform 0.42s ${EASE_OUT}, opacity 0.30s ${EASE_OUT}`;
            headerWrapper.style.transformOrigin = '50% 30%';
            headerWrapper.style.transform       = 'scale(0.93) translateY(20px)';
            headerWrapper.style.opacity         = '0';
            headerWrapper.style.setProperty('pointer-events', 'none', 'important');
          }

          if (seamlessNp) {
            for (const el of [this._titleEl, this._subBadgesWrapper]) {
              if (!el) continue;
              el.style.transition = 'opacity 0.20s ease';
              el.style.opacity    = '1';
            }
          } else {
            overlayEl.style.transition = `opacity 0.20s ease`;
            overlayEl.style.opacity    = '1';
          }

          // Each entity section slides up with a spring curve and slight stagger.
          let maxMs = 600;
          for (const w of Array.from(this._contentEl?.children || [])) {
            if (w._animIndex !== undefined) {
              const delayMs = (w._animIndex || 0) * 40;
              if (550 + delayMs > maxMs) maxMs = 550 + delayMs;
              w.style.transition = `transform 0.55s ${delayMs}ms ${SPRING_IN}`;
              w.style.transform  = 'translateY(0)';
            }
          }

          // Entry settled - engage the scroll-linked header.
          setTimeout(() => {
            if (live() && overlayEl) {
              this._keepBlurUp();
              overlayEl.style.transition = 'none';
              if (this._titleEl)          this._titleEl.style.transition = 'none';
              if (this._subBadgesWrapper) this._subBadgesWrapper.style.transition = 'none';
              for (const w of Array.from(this._contentEl?.children || [])) {
                if (w._animIndex !== undefined) {
                  w.style.transition = 'none';
                  w.style.removeProperty('transform');
                }
              }
              const tryEngage = () => {
                if (!live()) return;
                if (_touchActive) { setTimeout(tryEngage, 120); return; }
                this._engageScrollHeader();
              };
              tryEngage();
            }
          }, maxMs + 60);
        });
      });
    }

    // ── Scroll-header mode ─────────────────────────────────────────────────────
    _engageScrollHeader() {
      const overlayEl = this._overlayEl;
      const contentEl = this._contentEl;
      const badgeW    = this._badgeRowWrapper;
      const badgeEl   = this._badgeRowEl;
      const titleEl   = this._titleEl;
      const hdr       = this._compactHeaderEl;
      if (!this._showing || this._scrollHandler) return;
      if (_movedBadgeRow && _movedBadgeRow.owner !== this) return;
      const noBadge = !!this._config?.room;
      if (!overlayEl || !contentEl || !titleEl || !hdr ||
          (!noBadge && (!badgeW || !badgeEl))) return;

      overlayEl.style.removeProperty('transform');

      const preMoved = !!(_movedBadgeRow && _movedBadgeRow.owner === this);

      const hdrRect = hdr.getBoundingClientRect();
      const lockTop = hdrRect.bottom + BADGE_LOCK_GAP;
      let badgeBottom = hdrRect.bottom - 4;

      if (!noBadge) {
        const card = badgeEl.shadowRoot?.querySelector('ha-card') || badgeEl;
        const cardRect0      = card.getBoundingClientRect();
        const badgeTopTarget = cardRect0.top;
        const cardH          = cardRect0.height;
        badgeBottom = lockTop + cardH;
        const sub = (this._subBadgesWrapper && this._subBadgesWrapper.parentNode === contentEl)
          ? this._subBadgesWrapper
          : (this._gapSpacer?.parentNode === contentEl ? this._gapSpacer : null);
        const subTopBefore = sub ? sub.getBoundingClientRect().top : null;
        const pillBf = window.getComputedStyle(badgeEl)
          .getPropertyValue('--ha-card-backdrop-filter').trim();

        if (!preMoved) {
          // Fallback for a discovery failure at rAF1: the same sticky adoption.
          _movedBadgeRow = {
            owner: this, wrapper: badgeW, el: badgeEl,
            parent: badgeW.parentNode, sibling: badgeW.nextSibling,
          };

          badgeEl.style.setProperty('position', 'relative', 'important');
          badgeEl.style.setProperty('top',      '0',        'important');
          badgeEl.style.removeProperty('left');
          badgeEl.style.removeProperty('right');
          badgeEl.style.removeProperty('width');
          // Clear a preceding room popup's stamps, as the rAF1 path does.
          badgeW.style.removeProperty('opacity');
          badgeW.style.removeProperty('pointer-events');
          badgeW.style.setProperty('position', 'sticky',       'important');
          badgeW.style.setProperty('top',      `${lockTop}px`, 'important');
          badgeW.style.setProperty('z-index',  '30',           'important');
          if (pillBf) badgeW.style.setProperty('--ha-card-backdrop-filter', pillBf);
          const badgesScroller = badgeEl.shadowRoot?.querySelector('#badges');
          const badgesSL       = badgesScroller ? badgesScroller.scrollLeft : 0;
          contentEl.insertBefore(badgeW, titleEl.nextSibling);
          if (badgesScroller && badgesSL) badgesScroller.scrollLeft = badgesSL;

          const cardShift = badgeTopTarget - card.getBoundingClientRect().top;
          badgeW.style.setProperty('margin-top', `${cardShift.toFixed(2)}px`, 'important');
          if (sub && subTopBefore != null) {
            const subShift = subTopBefore - sub.getBoundingClientRect().top;
            const curMt    = parseFloat(sub.style.getPropertyValue('margin-top')) || 0;
            sub.style.setProperty('margin-top', `${(curMt + subShift).toFixed(2)}px`, 'important');
          }
        } else {
          badgeW.style.setProperty('top', `${lockTop}px`, 'important');
        }
      }

      this._gradientBlurEl?.remove();
      const gradH = badgeBottom + 100;
      const popupHard = (px, maxA = 1) => {
        const c = maxA >= 1 ? 'black' : `rgba(0,0,0,${maxA})`;
        return `linear-gradient(to bottom, ${c} 0px, ${c} ${px}px, transparent ${px}px)`;
      };
      const gradMask = popupHard(badgeBottom + 12);
      const gradWrap = document.createElement('div');
      gradWrap.style.cssText = 'position:sticky;top:0;height:0;z-index:25;pointer-events:none;';
      const grad = document.createElement('div');
      grad.style.cssText = [
        'position:absolute', 'top:0', 'left:0', 'right:0',
        `height:${gradH}px`, 'opacity:0',
        'transition:opacity 220ms ease-in-out',
        // Same material as the dashboard bar.
        'backdrop-filter:blur(22px) saturate(1.2) brightness(0.97)',
        '-webkit-backdrop-filter:blur(22px) saturate(1.2) brightness(0.97)',
        `mask-image:${gradMask}`, `-webkit-mask-image:${gradMask}`,
        'transform:translateZ(0)', '-webkit-transform:translateZ(0)',
      ].join(';');
      gradWrap.appendChild(grad);

      const barEdge = document.createElement('div');
      barEdge.style.cssText = [
        'position:absolute', 'left:0', 'right:0',
        `top:${badgeBottom + 11}px`, 'height:11px', 'opacity:0',
        'transition:opacity 220ms ease-in-out',
        'background:linear-gradient(to bottom, rgba(18,20,26,0.025), rgba(18,20,26,0))',
        'border-top:0.5px solid rgba(255,255,255,0.10)',
        'box-sizing:border-box',
      ].join(';');

      let veil = null;
      try {
        let bgAfter = null;
        const bgInner = _findBgCard();
        if (bgInner) {
          const acs = getComputedStyle(bgInner, '::after');
          if (acs.backgroundImage && acs.backgroundImage.includes('url(')) bgAfter = acs;
        }
        const vh = window.innerHeight || 800;
        veil = document.createElement('div');
        const veilMask = popupHard(badgeBottom + 12, 0.5);
        veil.style.cssText = [
          'position:absolute', 'top:0', 'left:0', 'right:0',
          `height:${vh}px`, 'opacity:0', 'overflow:hidden',
          'transition:opacity 220ms ease-in-out',
          `mask-image:${veilMask}`, `-webkit-mask-image:${veilMask}`,
        ].join(';');
        const veilInner = document.createElement('div');
        veilInner.style.cssText = [
          'position:absolute', 'top:0', 'left:0', 'right:0', 'bottom:0',
          'background-repeat:no-repeat',
          // The scale pushes the blur's transparent edge bleed off-screen.
          'filter:blur(44px) saturate(1.02)', 'transform:scale(1.12)',
        ].join(';');
        if (this._blurLayerRoomBg) {
          // #8: Raum mit eigenem Foto: dasselbe Foto wie die Hintergrundebene, gleich gelegt
          // (Rand außerhalb des Bildschirms), Unschärfe skaliert mit der Einstellung.
          Object.assign(veilInner.style, {
            top: '-96px', left: '-96px', right: 'auto', bottom: 'auto',
            width: 'calc(100vw + 192px)', height: 'calc(100lvh + 192px)',
            transform: 'none', filter: `blur(${ROOM_VEIL_BLUR}) saturate(1.02)`,
            background: this._blurLayerRoomBg,
          });
        } else if (bgAfter) {
          veilInner.style.backgroundImage    = `linear-gradient(var(--casora-filter-veil, rgba(0,0,0,0.22)), var(--casora-filter-veil, rgba(0,0,0,0.22))), ${bgAfter.backgroundImage}`;
          veilInner.style.backgroundPosition = `0 0, ${bgAfter.backgroundPosition}`;
          veilInner.style.backgroundSize     = `100% 100%, ${bgAfter.backgroundSize}`;
        } else {
          veilInner.style.backgroundImage = 'linear-gradient(rgba(24,28,38,0.92), rgba(24,28,38,0.92))';
        }
        veil.appendChild(veilInner);
        gradWrap.appendChild(veil);
      } catch (_) {}
      // Appended last so the edge line paints above the veil.
      gradWrap.appendChild(barEdge);

      contentEl.insertBefore(gradWrap, contentEl.firstChild);
      this._gradientBlurEl = gradWrap;

      const titleBottomDoc = titleEl.getBoundingClientRect().bottom + overlayEl.scrollTop;
      const fadeStart = Math.max(0, titleBottomDoc - lockTop - 24);
      const fadeEnd   = Math.max(fadeStart + 1,
        titleBottomDoc - (hdrRect.bottom - COMPACT_BAR_HEIGHT));
      let popupBarOn = false; // bar hysteresis state (per engage)
      this._scrollHandler = () => {
        const p = Math.max(0, Math.min(1,
          (overlayEl.scrollTop - fadeStart) / (fadeEnd - fadeStart)));
        const tp = Math.min(1, p / 0.45);
        titleEl.style.opacity   = String(1 - tp);
        titleEl.style.transform = `scale(${1 - tp * 0.04})`;
        const cp = Math.max(0, (p - 0.55) / 0.45);
        hdr.style.opacity     = String(cp);
        // Rises gently into place from below.
        hdr.style.transform   = `translateY(${(1 - cp) * 5}px)`;
        hdr.style.pointerEvents = cp > 0.5 ? 'auto' : 'none';
        if (this._headFillEl) this._headFillEl.style.opacity = String(cp);
        popupBarOn = popupBarOn ? p >= 0.45 : p >= 0.55;
        grad.style.opacity    = popupBarOn ? '1' : '0';
        barEdge.style.opacity = popupBarOn ? '1' : '0';
        if (veil) veil.style.opacity = popupBarOn ? '1' : '0';
      };
      overlayEl.addEventListener('scroll', this._scrollHandler, { passive: true });
      this._scrollHandler();

      // Give the popup's sub-badge/Now Playing rows real scrollWidth.
      _fixRowWidths(contentEl);

      for (const w of [this._subBadgesWrapper, this._npWrapper]) {
        const bc = w && this._getBC(w);
        if (bc && this._hass) {
          try { bc.hass = this._hass; } catch (_) {}
          _flushRender(bc);
        }
      }

      if (this._npNaturalTop != null && this._npWrapper?.parentNode === contentEl) {
        const fixNp = () => {
          if (!this._showing || overlayEl.scrollTop > 1) return;
          if (this._npWrapper?.parentNode !== contentEl) return;
          if (isLandscapePhone()) return;
          _alignAdoptedEl(this._npWrapper, this._npNaturalTop, 12, NP_LATE_DEAD_ZONE);
        };
        fixNp();
        setTimeout(fixNp, 350);
      }
    }

    // ── Animate Out ────────────────────────────────────────────────────────────

    _animOut() {
      const blurEl    = this._blurLayerEl;
      const overlayEl = this._overlayEl;
      if (!blurEl || !overlayEl) return;
      if (_activeOverlay === this) _activeOverlay = null;
      _showChromePill();

      this._suppressedWrappers = [];
      this._hiddenSmartRows    = [];
      window._casoraNoFilterAnim = true;
      for (const hsr of (window._casoraSmartRows || [])) {
        const sr = hsr.shadowRoot;
        if (sr) {
          for (const wrapper of sr.querySelectorAll('.card-wrapper')) {
            if (wrapper === this._badgeRowWrapper && !this._config?.room) continue;
            if (this._headerEl && wrapper.contains(this._headerEl)) continue;
            wrapper.style.transition = 'none';
            wrapper.style.height     = '';
            wrapper.style.overflow   = '';
            wrapper.style.setProperty('--casora-anim-name',     'none');
            wrapper.style.setProperty('--casora-anim-duration', '0.001s');
            wrapper.style.setProperty('--casora-anim-delay',    '-1s');
            wrapper.style.setProperty('opacity', '0', 'important');
            wrapper.style.setProperty('pointer-events', 'none', 'important');
            this._suppressedWrappers.push(wrapper);
          }
        }
      }

      // Cascade the suppression, as the dismiss path does.
      if (this._container) {
        this._container.style.setProperty('--casora-anim-name', 'none');
        this._container.style.setProperty('--casora-anim-duration', '0.001s');
        this._container.style.setProperty('--casora-anim-delay', '-1s');
      }

      // Hide the content immediately so no card flashes.
      if (this._contentEl) this._contentEl.style.visibility = 'hidden';

      if (this._scrollHandler) {
        this._overlayEl?.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
      if (this._titleEl) { this._titleEl.remove(); this._titleEl = null; }
      this._backBtn?.remove();
      this._backBtn = null;
      // Scroll-header teardown, as in _dismiss.
      if (this._compactHeaderEl) { this._compactHeaderEl.remove(); this._compactHeaderEl = null; }
      if (this._headFillEl) { this._headFillEl.remove(); this._headFillEl = null; }
      if (this._gradientBlurEl)  { this._gradientBlurEl.remove();  this._gradientBlurEl  = null; }
      // Restored instantly, never animated, so it reads as a fixed anchor.
      if (_movedBadgeRow && _movedBadgeRow.owner === this) _restoreBadgeRow();
      const toFilter   = this._hass?.states?.['input_select.casora_mobile_filter']?.state;
      const npWasMoved = !!this._npSaved;
      this._restoreMovedWrappers();
      if (npWasMoved && toFilter === 'all' && this._npWrapper) {
        this._npWrapper.style.setProperty('position', 'relative', 'important');
        this._npWrapper.style.setProperty('z-index', '51', 'important');
      }
      const headerEl      = this._headerEl;
      this._headerEl      = null;
      const headerWrapper = this._headerWrapper;
      this._headerWrapper = null;
      for (const bc of this._badgeShadowCards) {
        bc.style.removeProperty('box-shadow');
        bc.style.removeProperty('background');
        bc.style.removeProperty('backdrop-filter');
        bc.style.removeProperty('-webkit-backdrop-filter');
      }
      this._badgeShadowCards = [];
      if (this._badgeRowEl) {
        this._badgeRowEl.style.removeProperty('background');
        this._badgeRowEl.style.removeProperty('backdrop-filter');
        this._badgeRowEl.style.removeProperty('-webkit-backdrop-filter');
        this._badgeRowEl.style.removeProperty('box-shadow');
        this._badgeRowEl.style.setProperty('z-index', '51', 'important');
      }
      const badgeRowEl = this._badgeRowEl;
      this._badgeRowEl = this._badgeRowWrapper = null;

      const scalableEls = this._scalableEls;
      this._scalableEls = [];

      overlayEl.style.overflow   = '';
      overlayEl.style.pointerEvents = 'none';
      overlayEl.style.clipPath   = 'inset(0%)';
      overlayEl.style.transition = `opacity 0.22s ${EASE_OUT}, transform 0.30s ${EASE_OUT}, clip-path 0.32s ${EASE_OUT}`;
      overlayEl.style.opacity    = '0';
      overlayEl.style.transform  = 'translateY(40%)';
      overlayEl.style.clipPath   = 'inset(6% round 22px)';

      this._pendingBlurFade = { blurEl, overlayEl, scalableEls, headerEl, badgeRowEl, headerWrapper,
        npWrappers: (npWasMoved && toFilter === 'all') ? [this._npWrapper] : [] };
      if (toFilter && toFilter !== 'all') {
        setTimeout(() => this._runBlurFade(), 600);
      } else {
        this._runBlurFade();
      }
    }
  }

  customElements.define('casora-filter-overlay', CasoraFilterOverlay);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type:        'casora-filter-overlay',
    name:        'Casora Filter Overlay',
    description: 'Casora category filter overlay panel',
    preview:     false,
  });
})();
