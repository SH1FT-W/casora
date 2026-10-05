// smart-row.js

const EMPTY_SET = new Set();
const activeStates     = () => window.CASORA_ACTIVE_STATES || EMPTY_SET;
const filterCategories = () => window.CASORA_FILTER_CATEGORIES || {};

(function measureSafeArea() {
  function measure() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;right:0;width:0;height:0;pointer-events:none;visibility:hidden;';
    probe.style.paddingLeft  = 'env(safe-area-inset-left, 0px)';
    probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const l = cs.paddingLeft, r = cs.paddingRight;
    probe.remove();
    document.documentElement.style.setProperty('--casora-measured-safe-left', l);
    document.documentElement.style.setProperty('--casora-measured-safe-right', r);
  }
  if (document.body) measure();
  else document.addEventListener('DOMContentLoaded', measure, { once: true });
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);
})();

const PAGE_ANIM_MS  = 900;  // time for the card entrance animation to finish
const SORT_DELAY_MS = 2500; // hold time before a state change triggers a sort
const SORT_MS       = 450;  // FLIP slide duration
const EASE_FORWARD  = 'cubic-bezier(0.4, 0, 0.2, 1)';
const EASE_BACK     = 'cubic-bezier(0.4, 0, 0.2, 1)';
const STAGGER_MS    = 0;    // all cards move together

function resolveCardConfig(cfg) {
  let c = cfg, depth = 0;
  while (c?.type === 'conditional' && c.card && depth++ < 4) c = c.card;
  return c;
}

// Performance mode, asked twice: casora-core owns the answer, but it is a
// separate resource, so early on the only evidence is the stylesheet it wrote.
function perfOn() {
  try {
    if (window._casoraPerf && window._casoraPerf.on()) return true;
  } catch (e) {}
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--casora-anim-duration').trim();
    return v === '0s' || v === '0';
  } catch (e) { return false; }
}

// Opt in with ?casora_rowlog=1 on the dashboard URL. Off, this costs one
// property read per call and prints nothing.
let ROWLOG = null;
function rowLog() {
  if (ROWLOG === null) {
    try { ROWLOG = /[?&]casora_rowlog=1/.test(location.search) || !!window.CASORA_ROW_DEBUG; }
    catch (e) { ROWLOG = false; }
  }
  if (!ROWLOG) return;
  console.info.apply(console, ['casora-row'].concat([].slice.call(arguments)));
}

function isCardDisabled(cfg, phone) {
  const c = resolveCardConfig(cfg);
  const v = c && c.variables && c.variables.enabled;
  if (v === false || v === 'false' || v === 0 || v === '0') return true;
  const s = c && c.variables && c.variables.surfaces;
  if (s === 'phone')   return !phone;
  if (s === 'desktop') return !!phone;
  return false;
}

// A card with no template is one Casora only stores: it draws whatever it likes
// at whatever height, and the tracks here are fixed.
function isRawCard(cfg) {
  const c = resolveCardConfig(cfg);
  return !!c && !c.template && !String(c.type || '').startsWith('custom:casora-');
}

// button-card's templates, reached the way button-card reaches them.
let _llTpl = null;
function llTemplates() {
  if (_llTpl) return _llTpl;
  try {
    let e = document.querySelector('home-assistant');
    e = e && e.shadowRoot && e.shadowRoot.querySelector('home-assistant-main');
    e = e && (e.shadowRoot || e);
    e = e && e.querySelector('partial-panel-resolver, ha-drawer partial-panel-resolver');
    e = e && (e.shadowRoot || e);
    e = e && e.querySelector('ha-panel-lovelace');
    e = e && e.shadowRoot && e.shadowRoot.querySelector('hui-root');
    const t = e && e.lovelace && e.lovelace.config
      && e.lovelace.config.button_card_templates;
    if (t) _llTpl = t;
    return t || {};
  } catch (e) { return {}; }
}

// `show_when: active` steht meist in der Vorlage (z. B. casora_updates), nicht an der Karte.
// Nur die Karte zu lesen ließ die Kachel erst in voller Höhe erscheinen und dann zuklappen –
// am Handy sprang alles darunter nach oben (Hemma 2.2.0, MIT).
function startsClosed(cfg) {
  const c = resolveCardConfig(cfg);
  if (!c) return false;
  const own = c.variables?.show_when;
  if (own !== undefined && own !== null && own !== '') return String(own) === 'active';
  const names = Array.isArray(c.template) ? c.template : (c.template ? [c.template] : []);
  const tpl = llTemplates();
  const seen = new Set();
  // Wie button-card: die zuletzt genannte Vorlage gewinnt, Eltern nur, wenn sie nichts sagt.
  const walk = (name, depth) => {
    if (!name || depth > 4 || seen.has(name)) return undefined;
    seen.add(name);
    const t = tpl[name];
    if (!t) return undefined;
    const up = Array.isArray(t.template) ? t.template : (t.template ? [t.template] : []);
    const v = t.variables?.show_when;
    if (v !== undefined && v !== null && v !== '') return String(v);
    for (let k = up.length - 1; k >= 0; k--) {
      const r = walk(up[k], depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  for (let k = names.length - 1; k >= 0; k--) {
    const r = walk(names[k], 0);
    if (r !== undefined) return r === 'active';
  }
  return false;
}

// Returns the card's filter category, or null if it should always be shown.
function getFilterCategory(card) {
  const cfg = resolveCardConfig(card?._config);
  if (!cfg) return null;
  const direct = cfg.variables?.mobile_filter_category;
  if (direct !== null && direct !== undefined) return direct;
  const tmpl = cfg.template;
  const list = Array.isArray(tmpl) ? tmpl : (tmpl ? [tmpl] : []);
  const cats = filterCategories();
  for (const t of list) {
    if (Object.prototype.hasOwnProperty.call(cats, t)) return cats[t];
  }
  if (list.includes('casora_mobile_header')) {
    const slug = String(cfg.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (Object.prototype.hasOwnProperty.call(HEADER_CATEGORIES, slug)) return HEADER_CATEGORIES[slug];
  }
  return null;
}

const ROW_TEMPLATE_FLAGS = {
  casora_mobile_weather:        { full_width: true },
  casora_mobile_header:         { full_width: true },
  casora_mobile_filter_badges:  { full_width: true, no_filter: true },
  casora_mobile_sensor_chips:   { full_width: true, no_filter: true, collapsed_spacer: true },
  casora_mobile_now_playing:    { full_width: true, no_filter: true },
  casora_scene_row:             { full_width: true },
};

// A header is generic, so the category it labels comes from its name.
const HEADER_CATEGORIES = { scenes: 'unfiltered' };

// variables.size is the Studio's "Size on phone": it sits on the desktop tile too
// (mirrored to the phone on save), so only a phone row may read it. Desktop and
// tablet rows drop it and keep only what a template itself declares large.
const getCardSize = (rawCfg, phone) => {
  let cfg = resolveCardConfig(rawCfg);
  if (!phone && cfg?.variables?.size !== undefined) {
    const { size, ...rest } = cfg.variables;
    cfg = { ...cfg, variables: rest };
  }
  return window.casoraCardSize?.(cfg) ||
    (String(cfg?.variables?.size || '').toLowerCase() === 'large' ? 'large' : 'small');
};

function cardFlag(cfg, flag) {
  if (!cfg) return false;
  if (cfg[flag] !== undefined) return !!cfg[flag];
  const inner = resolveCardConfig(cfg);
  if (inner !== cfg) return cardFlag(inner, flag);
  if (flag === 'no_filter'  && cfg.type === 'custom:casora-filter-overlay') return true;
  if (flag === 'full_width' && cfg.type === 'custom:casora-smart-row') return true;
  const tmpl = cfg.template;
  const list = Array.isArray(tmpl) ? tmpl : (tmpl ? [tmpl] : []);
  return list.some((t) => ROW_TEMPLATE_FLAGS[t]?.[flag] === true);
}

function isDesktop() {
  const p = window.matchMedia('(max-width: 767px) and (orientation: portrait), (max-height: 500px) and (orientation: portrait)').matches;
  const l = window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;
  return !p && !l;
}

// ── Erstes Laden am Handy (30.09.2026) ─────────────────────────────────────────
// Das Handy-Home zeigt nur Kopf, Badges und Favoriten; die Raum-Abschnitte
// darunter blendet casora-mobile-nav aus (_slimHome). Die Leiste kommt aber erst
// mit den Modulen des Laders (casora-local.js), am Handy im Mobilfunk mitunter
// viele Sekunden nach dieser Reihe – bis dahin standen alle Räume ungefiltert da.
// Jetzt bleibt in der äußeren Home-Reihe alles ab der ersten Überschrift
// verdeckt, bis die Leiste aufgeräumt hat und der Lader fertig ist; dauert es
// länger als 300 ms, zeigen drei ruhige Punkte, dass noch etwas kommt. Nach
// höchstens BOOT_MAX_MS erscheint alles, auch wenn eins davon ausbleibt.
// Nur wenn die Ansicht eine casora-mobile-nav mit Aufräumen hat – Desktop,
// Tablet und die Studio-Vorschau bleiben unberührt.
const BOOT_MAX_MS = 8000;
const bootPending = () => !(window._casoraHomeSlim && window._casoraLocalLoaded);

function tplList(cfg) {
  const t = cfg && cfg.template;
  return Array.isArray(t) ? t : (t ? [t] : []);
}

// Konfiguration der casora-mobile-nav in der Ansicht, in der el steckt (über
// hui-root nach oben gesucht), sonst null.
function slimNavConfig(el) {
  let n = el, root = null;
  for (let i = 0; n && i < 80; i++) {
    if (n.localName === 'hui-root') { root = n; break; }
    n = n.parentNode || n.host;
  }
  const views = root && root.lovelace && root.lovelace.config && root.lovelace.config.views;
  if (!Array.isArray(views)) return null;
  let found = null;
  const walk = (x, depth) => {
    if (found || !x || typeof x !== 'object' || depth > 12) return;
    if (Array.isArray(x)) { x.forEach((y) => walk(y, depth + 1)); return; }
    if (x.type === 'custom:casora-mobile-nav') { found = x; return; }
    for (const k of ['cards', 'sections', 'card', 'elements']) if (x[k]) walk(x[k], depth + 1);
  };
  walk(views, 0);
  return found && found.slim_home !== false ? found : null;
}

class CasoraSmartRow extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass            = null;
    this._config          = null;
    this._helpers         = null;
    this._cards           = [];
    this._wrappers        = [];
    this._haCards         = [];  // per-index ha-card cache for _isActiveByDom
    this._hiddenState     = [];  // last observed per-index hidden state
    this._reported        = new Set();  // indices whose card has announced its visibility
    this._cardsCreated    = false;
    this._initialized     = false;
    this._initializing    = false;
    this._activeSet       = new Set();
    this._activationOrder = [];
    this._sortTimer       = null;
    this._rafId           = null;
    this._sortEnabled     = true;
    this._lastKnownFilter = undefined;
    this._animHiding      = new Set();
    this._animShowing     = new Set();
    this._vizRetry1       = null;  // coalescing guards for the staggered
    this._vizRetry2       = null;  // re-checks in _updateWrapperVisibility
    this._vizSweep        = null;
  }

  connectedCallback() {
    (window._casoraSmartRows = window._casoraSmartRows || new Set()).add(this);
    if (!this._onVisChange) {
      this._onVisChange = (ev) => {
        const el = ev.composedPath ? ev.composedPath()[0] : ev.target;
        const i = this._cards.indexOf(el);
        if (i >= 0) this._reported.add(i);
        this._updateWrapperVisibility();
      };
      this.addEventListener('card-visibility-changed', this._onVisChange);
    }
    // Aufbau wurde abgebrochen oder kam vor dem Einhängen: jetzt nachholen.
    if (!this._cardsCreated && !this._initializing && this._hass && this._config) this._init();
    this._casoraMouseScroll();
    if (!this._initialized || !this._wrappers.length) return;
    if (isDesktop()) this.scrollTo({ left: 0, behavior: 'instant' });
    if (!this._probed) { this._probed = true; setTimeout(() => this._probe(), 900); }

    const inactive = this._config.cards.map((_, i) => i)
      .filter(i => !this._activeSet.has(i));
    const currentOrder = [...this._activationOrder, ...inactive];
    currentOrder.forEach((origIdx, pos) => {
      this._wrappers[origIdx].style.setProperty(
        '--casora-anim-delay', `${(pos * 0.04).toFixed(2)}s`
      );
    });
  }

  // Casora (30.09.2026): Am Desktop war die Kachelreihe rechts abgeschnitten, ohne
  // sichtbaren Weg zum Rest. Jetzt: Mausrad (senkrecht) scrollt die Reihe seitwärts,
  // solange sie in diese Richtung noch kann – an den Enden scrollt wieder die Seite;
  // Ziehen mit der Maus (ab 6 px, der Klick danach wird geschluckt) und ein weicher
  // Rand auf der Seite, auf der noch Kacheln liegen (#fade, siehe _css). Touch bleibt nativ.
  _casoraMouseScroll() {
    if (this._casoraMs) { this._casoraEdges(); return; }
    this._casoraMs = true;
    const scrolls = () => getComputedStyle(this).overflowX !== 'visible'
      && this.scrollWidth - this.clientWidth > 1;
    const max = () => this.scrollWidth - this.clientWidth;
    this.addEventListener('wheel', (e) => {
      if (e.ctrlKey || !scrolls()) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // Trackpad seitwärts: nativ
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.clientWidth : 1;
      const dy = e.deltaY * unit;
      if ((dy > 0 && this.scrollLeft >= max() - 1) || (dy < 0 && this.scrollLeft <= 0)) return;
      e.preventDefault();
      this.scrollLeft += dy;
    }, { passive: false });

    let drag = null;
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      this.style.scrollSnapType = '';
      this.style.cursor = '';
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      if (moved) {
        // Der Klick nach einem echten Ziehen öffnet keine Kachel.
        const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', eat, true), 0);
      }
    };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        this.style.scrollSnapType = 'none';
        this.style.cursor = 'grabbing';
      }
      e.preventDefault();
      this.scrollLeft = drag.left - dx;
    };
    this.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !scrolls()) return;
      // Regler, Eingabefelder u. ä. behalten ihr eigenes Ziehen.
      const t = e.composedPath()[0];
      if (t && t.closest && t.closest('input, textarea, select, ha-slider, ha-control-slider, [data-casora-nodrag]')) return;
      // Auch über Shadow-Grenzen: die Swipe-Kachel zieht selbst und reicht am Stapelende an die Reihe weiter.
      if (e.composedPath().some((n) => n.nodeType === 1 && n.hasAttribute('data-casora-nodrag'))) return;
      drag = { x: e.clientX, left: this.scrollLeft, moved: false };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
    });
    this.addEventListener('dragstart', (e) => { if (drag && drag.moved) e.preventDefault(); });

    // Höchstens einmal pro Bild messen: _casoraEdges liest die Lage aller Kacheln und schreibt
    // Masken – je Scroll-Ereignis aufgerufen ruckelte das Wischen (05.10.2026).
    const edges = () => {
      if (this._casoraEdgesRaf) return;
      this._casoraEdgesRaf = requestAnimationFrame(() => { this._casoraEdgesRaf = 0; this._casoraEdges(); });
    };
    // Während des Wischens keine Masken: eine Maske auf einer Kachel mit Glas-Unschärfe muss jedes
    // Bild neu gezeichnet werden und ließ das Wischen ruckeln. Erst wenn die Reihe ruht, kommt der
    // Verlauf zurück (scrollend, sonst 140 ms ohne Scroll-Ereignis).
    const settle = () => {
      clearTimeout(this._casoraScrollT);
      this._casoraScrollT = 0;
      if (this.hasAttribute('casora-scrolling')) this.removeAttribute('casora-scrolling');
      if (!this._casoraScrolling) return;
      this._casoraScrolling = false;
      edges();
    };
    this.addEventListener('scroll', () => {
      // Kein Hover beim Wischen: am Touchpad steht der Zeiger über der Reihe, jede durchlaufende
      // Kachel startete ihren Hover-Übergang (Anheben, Schatten) mitten in der Bewegung.
      if (!this.hasAttribute('casora-scrolling')) this.setAttribute('casora-scrolling', '');
      // Maus/Touchpad (ohne Einrasten): der Verlauf bleibt beim Wischen fest am Rand und wird je
      // Bild mitgeführt. Nur bei Touch mit Einrasten pausiert er (Boxwechsel ließ WebKit nachrasten).
      if (this._casoraLiveFade === undefined) {
        try { this._casoraLiveFade = window.matchMedia('(pointer: fine)').matches; } catch (e) { this._casoraLiveFade = false; }
      }
      if (this._casoraLiveFade) { edges(); }
      else if (!this._casoraScrolling && this._casoraFaded) {
        this._casoraScrolling = true;
        // Nur die Maske weg, data-casora-fade (Schattenrand) bleibt: das Attribut ändert die Box
        // der Hülle, mitten im Wischen hieß das neues Layout und in WebKit Nachrasten (05.10.2026).
        for (const w of this._wrappers) {
          if (!w.dataset.casoraFade) continue;
          w.style.removeProperty('-webkit-mask-image');
          w.style.removeProperty('mask-image');
        }
      }
      clearTimeout(this._casoraScrollT);
      this._casoraScrollT = setTimeout(settle, 140);
    }, { passive: true });
    // scrollend kommt in Chromium nach jedem einzelnen Rad-Schritt: kurz warten, ob weitergewischt
    // wird, sonst wird zwischen zwei Schritten jedes Mal neu gemessen und maskiert.
    this.addEventListener('scrollend', () => {
      clearTimeout(this._casoraScrollT);
      this._casoraScrollT = setTimeout(settle, 80);
    }, { passive: true });
    window.addEventListener('resize', edges);
    if (window.ResizeObserver) {
      this._casoraRo = new ResizeObserver(edges);
      this._casoraRo.observe(this);
      const box = this.shadowRoot && this.shadowRoot.getElementById('container');
      if (box) { this._casoraRoBox = true; this._casoraRo.observe(box); }
    }
    setTimeout(() => this._casoraEdges(), 1000);
  }

  _casoraRowMode() {
    let v = '';
    try { v = localStorage.getItem('casora_row_overflow') || ''; } catch (e) { /* gesperrt */ }
    const cs = getComputedStyle(this);
    if (!v) v = cs.getPropertyValue('--casora-row-overflow').trim();
    if (!v && cs.getPropertyValue('--casora-row-arrows').trim() === 'block') v = 'arrows';
    return /^(arrows|fade|more)$/.test(v) ? v : '';
  }

  // Sichtbare Kacheln in Anzeigereihenfolge (ohne die von „more“ ausgeblendeten mitzuzählen).
  _casoraShown() {
    return this._wrappers
      .map((w, i) => ({ w, i, o: Number(w.style.order || i) }))
      .filter(({ w }) => w.style.display !== 'none')
      .sort((a, b) => a.o - b.o || a.i - b.i)
      .map(({ w }) => w);
  }

  _casoraEdges() {
    const mode = this._casoraRowMode();
    if (this.getAttribute('casora-row-mode') !== mode) {
      if (mode) this.setAttribute('casora-row-mode', mode); else this.removeAttribute('casora-row-mode');
    }
    if (mode !== 'more' && this._casoraPagingSig) {
      this._casoraPagingSig = '';
      this._wrappers.forEach((w) => w.removeAttribute('data-casora-page-off'));
    }
    if (mode !== 'fade' && this._casoraFaded) {
      this._casoraFaded = false;
      this._wrappers.forEach((w) => { delete w.dataset.casoraFade; w.style.removeProperty('-webkit-mask-image'); w.style.removeProperty('mask-image'); });
    }
    if (mode === 'more') this._casoraPaging();
    // Auch bei „fade“: rückt eine Kachel nach vorn (Sortieren nach Zustand), trägt sie sonst ihre
    // Randmaske mit und der Verlauf steht mitten in der Reihe (05.10.2026).
    if ((mode === 'more' || mode === 'fade') && !this._casoraMo && this._container && window.MutationObserver) {
      // Sortieren/Ein-/Ausblenden ändert style an den Hüllen – dann neu aufteilen.
      this._casoraMo = new MutationObserver((recs) => {
        // Nur die Hüllen der Reihe (Sortieren, Ein-/Ausblenden). Die Karten darin ändern ihren Stil
        // bei jeder Zustandsänderung in HA – darauf neu zu messen, ließ die Reihe hängen (05.10.2026).
        if (!recs.some((r) => r.target.parentNode === this._container)) return;
        if (this._casoraMoRaf) return;
        this._casoraMoRaf = requestAnimationFrame(() => { this._casoraMoRaf = null; this._casoraEdges(); });
      });
      this._casoraMo.observe(this._container, { subtree: true, attributes: true, attributeFilter: ['style'] });
      // Nach dem Verschieben (FLIP-Übergang) noch einmal an der Endposition messen.
      // Höchstens einmal pro Bild: Hover-Übergänge der Kacheln enden beim Wischen laufend.
      const settle = () => {
        if (this._casoraMoRaf) return;
        this._casoraMoRaf = requestAnimationFrame(() => { this._casoraMoRaf = null; this._casoraEdges(); });
      };
      this._container.addEventListener('transitionend', settle);
      this._container.addEventListener('animationend', settle);
    }
    const can = getComputedStyle(this).overflowX !== 'visible';
    const m = this.scrollWidth - this.clientWidth;
    // Der weiche Rand ist so breit wie der sichtbare Teil der Reihe (nicht der Scrollbereich).
    const vw = this.clientWidth + 'px';
    if (this.style.getPropertyValue('--hsr-view') !== vw) this.style.setProperty('--hsr-view', vw);
    this.toggleAttribute('casora-more-l', can && this.scrollLeft > 2);
    this.toggleAttribute('casora-more-r', can && m > 2 && this.scrollLeft < m - 2);
    if (mode === 'fade' && !this._casoraScrolling) this._casoraFade(can, m);
    if (this._casoraRo && !this._casoraRoBox) {
      const box = this.shadowRoot && this.shadowRoot.getElementById('container');
      if (box) { this._casoraRoBox = true; this._casoraRo.observe(box); }
    }
  }

  // Variante „fade“: nur die angeschnittene Kachel blendet zum Rand hin aus (Maske je Kachel,
  // nicht auf der Reihe – sonst verlören alle Glas-Kacheln ihre Unschärfe), plus Seitenpunkte.
  _casoraFade(can, m) {
    const dots = this.shadowRoot && this.shadowRoot.getElementById('dots');
    const host = this.getBoundingClientRect();
    // SHADOW = Innenabstand der maskierten Hülle (CSS unten, data-casora-fade): die Maske schneidet
    // an der Hüllen-Box ab, ohne diesen Rand endete der Kachelschatten dort hart (eckige Box).
    const INSET = 20, FADE = 150, SHADOW = 48;
    const R = host.right - INSET, L = host.left + INSET;
    const left = this.scrollLeft > 2;
    this._casoraFaded = true;
    for (const w of this._wrappers) {
      // Gemessen wird immer die Kachel selbst (ohne Schattenrand), sonst kippt die Entscheidung
      // mit dem eigenen Innenabstand hin und her.
      const b = w.getBoundingClientRect();
      const p = w.dataset.casoraFade && b.width ? SHADOW : 0;
      const r = { left: b.left + p, right: b.right - p, width: Math.max(0, b.width - 2 * p) };
      let g = '';
      if (can && r.width && r.right > R - FADE && r.left < R) {
        g = `linear-gradient(to right, #000 ${Math.round(R - FADE - r.left + SHADOW)}px, transparent ${Math.round(R - r.left + SHADOW)}px)`;
      } else if (can && left && r.width && r.left < L + FADE && r.right > L) {
        g = `linear-gradient(to right, transparent ${Math.round(L - r.left + SHADOW)}px, #000 ${Math.round(L + FADE - r.left + SHADOW)}px)`;
      }
      // Nur bei echter Änderung schreiben: der MutationObserver (style) würde sonst jede Runde neu auslösen.
      // Neu schreiben auch, wenn das Wischen die Maske entfernt hat (Attribut blieb stehen).
      if (g) { if (w.dataset.casoraFade !== g || !(w.style.getPropertyValue('mask-image') || w.style.getPropertyValue('-webkit-mask-image'))) { w.dataset.casoraFade = g; w.style.setProperty('-webkit-mask-image', g); w.style.setProperty('mask-image', g); } }
      else if (w.dataset.casoraFade || w.style.maskImage || w.style.webkitMaskImage) { delete w.dataset.casoraFade; w.style.removeProperty('-webkit-mask-image'); w.style.removeProperty('mask-image'); }
    }
    if (!dots) return;
    const n = can && m > 2 ? Math.min(8, Math.ceil(this.scrollWidth / Math.max(1, this.clientWidth))) : 0;
    const act = n > 1 ? Math.round((this.scrollLeft / m) * (n - 1)) : 0;
    if (dots.childElementCount !== n) {
      dots.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.setAttribute('data-casora-nodrag', '');
        b.setAttribute('aria-label', String(i + 1));
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const max = this.scrollWidth - this.clientWidth;
          this.scrollTo({ left: n > 1 ? (i / (n - 1)) * max : 0, behavior: 'smooth' });
        });
        dots.appendChild(b);
      }
    }
    [...dots.children].forEach((b, i) => b.classList.toggle('on', i === act));
  }

  // Variante „more“: so viele ganze Kacheln, wie neben die „+N weitere“-Kachel passen.
  // Antippen zeigt die nächsten; auf der letzten Seite führt sie zurück zum Anfang.
  _casoraPaging() {
    const more = this.shadowRoot && this.shadowRoot.getElementById('more');
    if (!more || !this._container) return;
    const shown = this._casoraShown();
    const phone = getComputedStyle(this).overflowX === 'visible';
    const cs = getComputedStyle(this._container);
    const gap = parseFloat(cs.columnGap) || 8;
    const rail = parseFloat(cs.paddingLeft) || 0;
    const first = shown.find((w) => !w.hasAttribute('data-casora-page-off')) || shown[0];
    const tile = first ? (first.offsetWidth || parseFloat(getComputedStyle(first).width) || 300) : 300;
    const capW = 132;
    const avail = this.clientWidth - rail - 24;
    const all = shown.length;
    let per = all;
    if (!phone && all * tile + (all - 1) * gap > avail) per = Math.max(1, Math.floor((avail - capW) / (tile + gap)));
    const pages = per >= all ? 1 : Math.ceil(all / per);
    let page = Math.min(this._casoraPage || 0, pages - 1);
    const sig = [phone, this.clientWidth, per, page, shown.map((w) => this._wrappers.indexOf(w)).join('.')].join('|');
    if (sig === this._casoraPagingSig) return;
    this._casoraPagingSig = sig;
    this._casoraPage = page;
    const tr = window.casoraTr || ((x) => x);
    shown.forEach((w, i) => w.toggleAttribute('data-casora-page-off', pages > 1 && (i < page * per || i >= (page + 1) * per)));
    if (pages <= 1) { more.removeAttribute('data-on'); return; }
    const rest = all - (page + 1) * per;
    more.setAttribute('data-on', rest > 0 ? 'next' : 'back');
    this._casoraPageNext = rest > 0 ? page + 1 : 0;
    more.firstChild.textContent = rest > 0 ? `+${rest}` : '';
    more.lastChild.textContent = rest > 0 ? tr('weitere') : tr('Zum Anfang');
    more.setAttribute('aria-label', rest > 0 ? `+${rest} ${tr('weitere')}` : tr('Zum Anfang'));
    if (this.scrollLeft) this.scrollTo({ left: 0, behavior: 'instant' });
  }

  _probe() {
    if (!/[?&]casorarowprobe=1/.test(location.search)) return;
    const R = (el) => {
      if (!el) return 'none';
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`
        + ` top ${Math.round(r.top)} bottom ${Math.round(r.bottom)}`;
    };
    const name = (el) => !el ? 'none'
      : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/)[0] : '');
    const unit = (u) => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;top:0;left:0;width:0;height:100${u};visibility:hidden;`;
      document.body.appendChild(d);
      const h = Math.round(d.getBoundingClientRect().height);
      d.remove();
      return h;
    };
    const box = this.shadowRoot.getElementById('container');
    const wrap = box && box.querySelector('.card-wrapper');
    const card = wrap && wrap.firstElementChild;
    const inner = card && card.shadowRoot && card.shadowRoot.querySelector('ha-card');
    const cs = getComputedStyle(this);
    const rows = [
      `window        ${window.innerWidth}x${window.innerHeight}`,
      `100svh        ${unit('svh')}        100dvh ${unit('dvh')}`,
      `row host      ${R(this)}   position ${cs.position}`,
      `offsetParent  ${name(this.offsetParent)}   ${R(this.offsetParent)}`,
      `#container    ${R(box)}   padding-bottom ${box ? getComputedStyle(box).paddingBottom : '?'}`,
      `card wrapper  ${R(wrap)}`,
      `card host     ${R(card)}   ${name(card)}`,
      `ha-card       ${R(inner)}`,
    ];
    const out = document.createElement('div');
    out.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;'
      + 'background:#000;color:#0f0;font:11px/1.5 ui-monospace,Menlo,monospace;'
      + 'padding:10px;white-space:pre-wrap;');
    out.textContent = 'CASORA ROW PROBE  (tap to dismiss)\n\n' + rows.join('\n');
    out.addEventListener('click', () => out.remove());
    document.body.appendChild(out);
  }

  disconnectedCallback() {
    window._casoraSmartRows?.delete(this);
    if (this._sortTimer) { clearTimeout(this._sortTimer); this._sortTimer = null; }
    if (this._rafId)     { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._vizRetry1) { clearTimeout(this._vizRetry1); this._vizRetry1 = null; }
    if (this._vizRetry2) { clearTimeout(this._vizRetry2); this._vizRetry2 = null; }
    if (this._vizSweep)  { clearTimeout(this._vizSweep);  this._vizSweep  = null; }
  }

  static getConfigElement() { return document.createElement('div'); }
  static getStubConfig()    { return { cards: [] }; }

  setConfig(config) {
    if (!Array.isArray(config.cards)) throw new Error('casora-smart-row: cards array required');
    this._config      = config;
    this._sortEnabled = config.sort !== false;
    this._scrollMode  = config.scroll_mode !== undefined
      ? !!config.scroll_mode
      : /^\/[^/]*[-_]mobile(\/|$)/i.test(window.location.pathname);
    this._rowPadding  = config.row_padding ??
      (this._sortEnabled
        ? '0 var(--casora-rail-left, 16px) 0 max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px))'
        : null);
  }

  set hass(hass) {
    // The filter is per device, so the entity is rewritten before any card in
    // the row sees it. casora-core may not have loaded yet, in which case this
    // is the shared value it always was.
    this._rawHass = hass;
    const F = window._casoraFilter;
    if (F && !this._filterOff) {
      this._filterOff = F.onChange(() => {
        if (this._rawHass) this.hass = this._rawHass;
      });
    }
    hass = F ? F.apply(hass) : hass;
    this._hass = hass;

    if (!this._cardsCreated) {
      if (!this._initializing) this._init();
      return;
    }

    for (const card of this._cards) {
      if (card) card.hass = hass;
    }

    if (!this._initialized) return;

    if (!this._rafId) {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        this._updateWrapperVisibility();
        this._updateSort();
      });
    }
  }

  // WebKit reports display:none for everything inside a hidden subtree.
  _isCardHiddenExplicit(card, wrapper) {
    if (wrapper && wrapper.dataset.off === '1') return true;
    return !!card && (card.hidden || card.style.display === 'none');
  }

  _heldClosed(i) {
    if (this._reported.has(i)) return false;
    return startsClosed(this._config.cards[i]);
  }

  _isCardHidden(card, wrapper) {
    if (wrapper && wrapper.dataset.off === '1') return true;
    if (!card) return false;
    if (card.hidden || card.style.display === 'none') return true;
    if (!wrapper || wrapper.style.display !== 'none') {
      return getComputedStyle(card).display === 'none';
    }
    wrapper.style.display = '';
    const hidden = getComputedStyle(card).display === 'none';
    wrapper.style.display = 'none';
    return hidden;
  }

  _updateWrapperVisibility() {
    if (!this._initialized) return;

    // The filter entity is global: only scroll_mode rows may honor it.
    const filter = this._scrollMode
      ? (window._casoraFilter
          ? window._casoraFilter.get()
          : this._hass?.states['input_select.casora_mobile_filter']?.state)
      : undefined;
    const filterChanged = this._lastKnownFilter !== undefined && filter !== this._lastKnownFilter;
    this._lastKnownFilter = filter;

    const isFilterHidden = (card) => {
      if (!filter || filter === 'all') return false;
      const cat = getFilterCategory(card);
      if (cat === null || cat === undefined) return false;
      if (cat === 'unfiltered') return true;
      return filter !== cat;
    };

    if (!this._sortEnabled) {
      // Repeat at intervals to catch both quick and slow card renders.
      const sync = () => {
        this._wrappers.forEach((wrapper, i) => {
          const card = this._cards[i];
          if (!card) return;
          const hide = isFilterHidden(card) || this._isCardHidden(card, wrapper)
            || this._heldClosed(i);
          if (!hide) delete wrapper.dataset.showWhen;
          wrapper.style.display = hide ? 'none' : '';
        });
      };
      sync();
      setTimeout(sync, 50);
      setTimeout(sync, 500);
      return;
    }

    const DUR  = 220;
    const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

    const horizontal = isDesktop();
    const gap = horizontal
      ? (parseFloat(getComputedStyle(this._container).columnGap) || 0)
      : 0;

    const clearAnimStyles = (wrapper) => {
      wrapper.style.transition  = '';
      wrapper.style.height      = '';
      wrapper.style.width       = '';
      wrapper.style.flex        = '';
      wrapper.style.marginRight = '';
      wrapper.style.opacity     = '';
      wrapper.style.overflow    = '';
      const card = wrapper.firstElementChild;
      if (card) {
        card.style.width = '';
        if (card.style.display === 'block') card.style.display = '';
      }
    };

    const hideWrapper = (wrapper, animate) => {
      if (wrapper.style.display === 'none') return;
      if (this._animHiding.has(wrapper)) return;
      if (this._animShowing.has(wrapper)) {
        this._animShowing.delete(wrapper);
        clearAnimStyles(wrapper);
      }
      if (!animate) { wrapper.style.display = 'none'; return; }
      this._animHiding.add(wrapper);
      const axis = horizontal ? 'width' : 'height';
      const size = horizontal ? wrapper.offsetWidth : wrapper.offsetHeight;
      if (horizontal) {
        wrapper.style.flex  = `0 0 ${size}px`;
        wrapper.style.width = size + 'px';
      } else {
        wrapper.style.height = size + 'px';
      }
      wrapper.style.overflow   = 'hidden';
      wrapper.style.opacity    = '1';
      wrapper.style.transition =
        `${axis} ${DUR}ms ${EASE}, flex-basis ${DUR}ms ${EASE}, ` +
        `margin-right ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!this._animHiding.has(wrapper)) return;
        if (horizontal) {
          wrapper.style.flex        = '0 0 0px';
          wrapper.style.width       = '0px';
          wrapper.style.marginRight = `-${gap}px`;
        } else {
          wrapper.style.height = '0';
        }
        wrapper.style.opacity = '0';
      }));
      setTimeout(() => {
        if (!this._animHiding.has(wrapper)) return;
        this._animHiding.delete(wrapper);
        wrapper.style.display = 'none';
        clearAnimStyles(wrapper);
      }, DUR);
    };

    const showWrapper = (wrapper, animate) => {
      delete wrapper.dataset.showWhen;
      if (this._animShowing.has(wrapper)) return;
      if (this._animHiding.has(wrapper)) {
        this._animHiding.delete(wrapper);
        clearAnimStyles(wrapper);
        wrapper.style.display = '';
        return;
      }
      if (wrapper.style.display !== 'none') return;
      wrapper.style.display = '';
      if (wrapper.dataset.size === 'large') this._scheduleLargeFill(wrapper);
      if (!animate) return;
      this._animShowing.add(wrapper);
      const axis = horizontal ? 'width' : 'height';
      const size = horizontal ? wrapper.offsetWidth : wrapper.offsetHeight;
      const card = wrapper.firstElementChild;
      if (horizontal && card) {
        card.style.display = 'block';
        card.style.width   = size + 'px';
      }
      if (horizontal) {
        wrapper.style.flex        = '0 0 0px';
        wrapper.style.width       = '0px';
        wrapper.style.marginRight = `-${gap}px`;
      } else {
        wrapper.style.height = '0';
      }
      wrapper.style.overflow   = 'hidden';
      wrapper.style.opacity    = '0';
      wrapper.style.transition =
        `${axis} ${DUR}ms ${EASE}, flex-basis ${DUR}ms ${EASE}, ` +
        `margin-right ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!this._animShowing.has(wrapper)) return;
        if (horizontal) {
          wrapper.style.flex        = `0 0 ${size}px`;
          wrapper.style.width       = size + 'px';
          wrapper.style.marginRight = '0px';
        } else {
          wrapper.style.height = size + 'px';
        }
        wrapper.style.opacity = '1';
      }));
      setTimeout(() => {
        if (!this._animShowing.has(wrapper)) return;
        this._animShowing.delete(wrapper);
        clearAnimStyles(wrapper);
      }, DUR + 50);
    };

    const snap = !!window._casoraNoFilterAnim;

    const show = (firstCall) => {
      this._wrappers.forEach((wrapper, i) => {
        const card = this._cards[i];
        if (!card) return;
        if (isFilterHidden(card)) {
          hideWrapper(wrapper, firstCall && filterChanged && !snap);
          this._hiddenState[i] = true;
          return;
        }
        const hidden = this._isCardHidden(card, wrapper);
        const was    = this._hiddenState[i];
        this._hiddenState[i] = hidden;

        if (hidden) {
          if (was === false || this._isCardHiddenExplicit(card, wrapper)) {
            hideWrapper(wrapper, !snap && was === false);
          }
          return;
        }
        if (this._heldClosed(i)) return;
        showWrapper(wrapper, !snap && (was === true || (firstCall && filterChanged)));
      });
      this.style.display = '';
    };

    show(true);

    if (!this._vizRetry1) this._vizRetry1 = setTimeout(() => {
      this._vizRetry1 = null;
      show(false);
    }, 100);
    if (!this._vizRetry2) this._vizRetry2 = setTimeout(() => {
      this._vizRetry2 = null;
      show(false);
    }, 250);
    if (this._vizSweep) return;
    this._vizSweep = setTimeout(() => {
      this._vizSweep = null;
      if (!this._initialized) return;
      this._config.cards.forEach((_, i) => this._reported.add(i));
      let anyVisible = false;
      this._wrappers.forEach((wrapper, i) => {
        const card = this._cards[i];
        if (!card) return;
        if (isFilterHidden(card) || this._isCardHidden(card, wrapper)) {
          this._hiddenState[i] = true;
          if (!this._animHiding.has(wrapper)) hideWrapper(wrapper, false);
        } else {
          this._hiddenState[i] = false;
          // Der Rundgang gibt zurückgehaltene show_when-Kacheln frei: eine von Anfang an aktive
          // meldet nie card-visibility-changed, sonst bliebe sie bis zum nächsten Zustand verborgen.
          if (wrapper.style.display === 'none' && !this._animShowing.has(wrapper)
              && startsClosed(this._config.cards[i])) {
            showWrapper(wrapper, false);
          }
          if (wrapper.style.display !== 'none' || this._animShowing.has(wrapper)) anyVisible = true;
        }
      });
      this.style.display = anyVisible ? '' : 'none';
    }, 500);
  }

  _patchNoFilterCard(card) {
    card.style.setProperty('filter',         'none', 'important');
    card.style.setProperty('-webkit-filter', 'none', 'important');
    // Retries catch nested cards that haven't rendered on the first pass.
    this._patchHaCardsDeep(card);
    setTimeout(() => this._patchHaCardsDeep(card), 400);
    setTimeout(() => this._patchHaCardsDeep(card), 1200);
  }

  _patchHaCardsDeep(root, attempts = 0) {
    const sr = root.shadowRoot;
    if (!sr) {
      if (attempts < 40) requestAnimationFrame(() => this._patchHaCardsDeep(root, attempts + 1));
      return;
    }
    const haCards = sr.querySelectorAll('ha-card');
    if (!haCards.length && attempts < 40) {
      requestAnimationFrame(() => this._patchHaCardsDeep(root, attempts + 1));
      return;
    }
    haCards.forEach(h => {
      h.style.setProperty('will-change',               'auto', 'important');
      h.style.setProperty('transition',                'none', 'important');
      h.style.setProperty('filter',                    'none', 'important');
      h.style.setProperty('-webkit-filter',            'none', 'important');
      h.style.setProperty('--casora-card-hover-filter', 'none');
    });
    sr.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) this._patchHaCardsDeep(el, 0);
    });
  }

  _scheduleLargeFill(wrapper) {
    const run = () => this._stampLargeFill(wrapper);
    requestAnimationFrame(run);
    setTimeout(run, 400);
    setTimeout(run, 1200);
    // casora-local-patch: Swipe-Karten setzen ihre Höhe später selbst neu – Stempel regelmäßig erneuern.
    if (!wrapper._casoraLargeFillInterval) {
      wrapper._casoraLargeFillInterval = setInterval(() => {
        if (!wrapper.isConnected) { clearInterval(wrapper._casoraLargeFillInterval); return; }
        run();
      }, 600);
    }
  }

  _stampLargeFill(el, depth = 0) {
    if (!el || depth > 16) return false;
    if (el.tagName === 'HA-CARD') return true;
    // Inline, not computed: a hidden subtree reads as none all the way down.
    if (el.style && el.style.display === 'none') return false;

    let onPath = false;
    const roots = el.shadowRoot ? [el.shadowRoot, el] : [el];
    for (const root of roots) {
      for (const kid of root.children || []) {
        if (this._stampLargeFill(kid, depth + 1)) onPath = true;
      }
    }

    if (onPath && depth > 0 && el.tagName.includes('-')) {
      if (getComputedStyle(el).display === 'inline') el.style.display = 'block';
      el.style.height    = '100%';
      el.style.flexGrow  = '1';
      el.style.minHeight = '0';
    }
    return onPath;
  }

  get hass() { return this._hass; }

  // Verdeckt ab der ersten Überschrift, solange Home am Handy noch nicht aufgeräumt ist (siehe oben).
  _bootSetup() {
    this._bootRelease();
    const cards = (this._config && this._config.cards) || [];
    this._bootFrom = -1;
    if (!bootPending()) return;
    if (!cards.some((c) => c && c.type === 'custom:casora-filter-overlay')) return;
    const first = cards.findIndex((c) => tplList(c).includes('casora_mobile_header'));
    if (first < 0 || !slimNavConfig(this)) return;
    this._bootFrom = first;
    this.setAttribute('casora-boot', '');
    this._bootCheck = () => { if (!bootPending()) this._bootRelease(); };
    window.addEventListener('casora-home-slim', this._bootCheck);
    window.addEventListener('casora-local-loaded', this._bootCheck);
    this._bootTimer = setTimeout(() => this._bootRelease(), BOOT_MAX_MS);
  }

  _bootMark(wrapper, i) {
    if (!(this._bootFrom >= 0) || i < this._bootFrom) return;
    wrapper.dataset.bootVeil = '1';
    if (i !== this._bootFrom) return;
    wrapper.dataset.bootFirst = '1';
    const dots = document.createElement('div');
    dots.className = 'casora-boot-wait';
    dots.setAttribute('role', 'status');
    dots.setAttribute('aria-label', 'Lädt');
    dots.innerHTML = '<i></i><i></i><i></i>';
    wrapper.appendChild(dots);
  }

  _bootRelease() {
    if (this._bootTimer) { clearTimeout(this._bootTimer); this._bootTimer = null; }
    if (this._bootCheck) {
      window.removeEventListener('casora-home-slim', this._bootCheck);
      window.removeEventListener('casora-local-loaded', this._bootCheck);
      this._bootCheck = null;
    }
    if (!this.hasAttribute('casora-boot')) return;
    this.setAttribute('casora-boot-out', '');
    this.removeAttribute('casora-boot');
    const sr = this.shadowRoot;
    setTimeout(() => {
      if (this.hasAttribute('casora-boot')) return;
      this.removeAttribute('casora-boot-out');
      sr.querySelectorAll('.casora-boot-wait').forEach((d) => d.remove());
    }, 400);
  }

  async _init() {
    this._initializing = true;

    if (!this._helpers) this._helpers = await window.loadCardHelpers();
    // Abgebrochener Aufbau (Zeile war zwischendurch nicht im DOM): neu beginnen.
    this.shadowRoot.innerHTML = '';
    if (!this.isConnected) { this._initializing = false; return; }

    const styleEl = document.createElement('style');
    styleEl.textContent = this._css();
    this.shadowRoot.appendChild(styleEl);

    // Spur: Reihe und weicher Rand liegen in derselben Rasterzelle, so breit wie der
    // ganze Scrollbereich – nur so bleibt der Rand (position: sticky) beim Blättern stehen.
    const track = document.createElement('div');
    track.id = 'track';
    const container = document.createElement('div');
    container.id = 'container';
    track.appendChild(container);
    const fade = document.createElement('div');
    fade.id = 'fade';
    fade.setAttribute('aria-hidden', 'true');
    fade.innerHTML = '<i class="l"></i><i class="r"></i>';
    track.appendChild(fade);
    // Pfeile (Weich-Audit H2, 05.10.2026): Am Rand abgeschnittene Kacheln sahen kaputt aus –
    // ein Pfeil zeigt, dass es weitergeht, und blättert um eine Seite. Sichtbar nur, wenn das
    // Theme --casora-row-arrows setzt (Weich) und in diese Richtung noch Kacheln liegen.
    const arrows = document.createElement('div');
    arrows.id = 'arrows';
    arrows.innerHTML = '<button class="l" type="button" tabindex="-1" data-casora-nodrag></button><button class="r" type="button" tabindex="-1" data-casora-nodrag></button>';
    arrows.querySelectorAll('button').forEach((b) => {
      const dir = b.classList.contains('l') ? -1 : 1;
      b.setAttribute('aria-label', dir < 0 ? 'Zurück' : 'Weiter');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        // Ohne Einrasten (Maus/Touchpad) selbst an einer Kachelkante landen.
        const step = dir * Math.max(200, this.clientWidth * 0.7);
        const host = this.getBoundingClientRect().left + (parseFloat(getComputedStyle(this).scrollPaddingLeft) || 0);
        const want = this.scrollLeft + step;
        let left = want, best = Infinity;
        for (const w of this._casoraShown()) {
          const pad = w.dataset.casoraFade ? 48 : 0;
          const x = this.scrollLeft + w.getBoundingClientRect().left + pad - host;
          if (Math.abs(x - want) < best) { best = Math.abs(x - want); left = x; }
        }
        this.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
      });
    });
    track.appendChild(arrows);
    // H2-Varianten (05.10.2026), wählbar per Theme --casora-row-overflow (arrows | fade | more)
    // oder zum Ausprobieren localStorage casora_row_overflow:
    //   fade – abgeschnittene Kachel blendet am Rand weich aus, darunter Seitenpunkte;
    //   more – nur ganze Kacheln, die letzte Stelle zeigt „+N weitere“ und blättert weiter.
    const dots = document.createElement('div');
    dots.id = 'dots';
    track.appendChild(dots);
    const more = document.createElement('div');
    more.id = 'more';
    more.setAttribute('role', 'button');
    more.setAttribute('data-casora-nodrag', '');
    more.style.order = '99999';
    more.innerHTML = '<b></b><span></span>';
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      this._casoraPage = this._casoraPageNext || 0;
      this._casoraPagingSig = '';
      this._casoraEdges();
    });
    container.appendChild(more);
    this.shadowRoot.appendChild(track);
    this._container = container;
    this._bootSetup();
    // Raum ohne Kacheln (Fix-Runde 1, A-16): dezente Leerzeile mit Weg ins Studio. Sichtbar nur,
    // wenn das Design --casora-empty-row-display setzt (Weich); sonst bleibt die Fläche leer wie bisher.
    if (!(this._config.cards || []).length && !this._scrollMode) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.setAttribute('role', 'link');
      hint.innerHTML = '<ha-icon icon="mdi:plus"></ha-icon><span></span>';
      hint.lastChild.textContent = (window.casoraTr || ((x) => x))('Noch keine Geräte – im Studio hinzufügen');
      hint.addEventListener('click', () => {
        const seg = (window.location.pathname || '').split('/').filter(Boolean);
        window.location.assign('/casora-studio' + (seg[1] ? '/' + seg[1] : '')
          + (seg[0] ? '?dash=' + encodeURIComponent(seg[0]) : ''));
      });
      container.appendChild(hint);
    }

    rowLog('build start', { sort: this._sortEnabled,
      scroll: this._scrollMode, cards: (this._config.cards || []).length });

    // Sort disabled: render in config order, no detection or reordering.
    if (!this._sortEnabled) {
      this._cards = this._config.cards.map((cfg) => {
        // Same rule as the sorted path below: an off card is never built.
        if (isCardDisabled(cfg, this._scrollMode)) return null;
        try {
          const card = this._helpers.createCardElement(cfg);
          card.hass = this._hass;
          return card;
        } catch (e) {
          console.warn('casora-smart-row: failed to create card', cfg, e);
          return null;
        }
      });
      this._wrappers = this._cards.map((card, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper';
        wrapper.dataset.idx = String(i);
        wrapper.style.setProperty('--casora-position-index', String(i));
        if (cardFlag(this._config.cards[i], 'full_width')) wrapper.dataset.fullwidth = '1';
        if (cardFlag(this._config.cards[i], 'collapsed_spacer')) wrapper.dataset.collapsedSpacer = '1';
        if (isCardDisabled(this._config.cards[i], this._scrollMode)) {
          wrapper.dataset.off = '1';
          wrapper.style.display = 'none';
          this._hiddenState[i] = true;
        } else if (startsClosed(this._config.cards[i])) {
          wrapper.dataset.showWhen = '1';
          wrapper.style.display = 'none';
          this._hiddenState[i] = true;
        }
        if (card) wrapper.appendChild(card);
        this._bootMark(wrapper, i);
        container.appendChild(wrapper);
        return wrapper;
      });
      this._cards.forEach((card, i) => {
        if (card && cardFlag(this._config.cards[i], 'no_filter')) this._patchNoFilterCard(card);
      });
      this._cardsCreated = true;
      this._initialized  = true;
      this._initializing = false;
      this._updateWrapperVisibility();
      return;
    }

    const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r()));



    this._cards       = [];
    this._wrappers    = [];
    this._haCards     = [];
    this._hiddenState = [];
    this._reported.clear();
    let budget = performance.now();

    for (let i = 0; i < this._config.cards.length; i++) {
      const cfg = this._config.cards[i];
      let card = null;
      const off = isCardDisabled(cfg, this._scrollMode);
      if (!off) {
        try {
          card = this._helpers.createCardElement(cfg);
        } catch (e) {
          console.warn('casora-smart-row: failed to create card', cfg, e);
        }
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'card-wrapper';
      wrapper.dataset.idx = String(i);
      wrapper.style.setProperty('--casora-position-index', String(i));
      if (cardFlag(cfg, 'full_width')) wrapper.dataset.fullwidth = '1';
      if (isRawCard(cfg)) wrapper.dataset.raw = '1';
      if (cardFlag(cfg, 'collapsed_spacer')) wrapper.dataset.collapsedSpacer = '1';
      if (getCardSize(cfg, this._scrollMode) === 'large') {
        wrapper.dataset.size = 'large';
        this._scheduleLargeFill(wrapper);
      }
      if (off) {
        wrapper.dataset.off = '1';
        wrapper.style.display = 'none';
        this._hiddenState[i] = true;
      } else if (startsClosed(cfg)) {
        wrapper.dataset.showWhen = '1';
        wrapper.style.display = 'none';
        this._hiddenState[i] = true;
      }
      wrapper.style.setProperty('--casora-init-play', 'paused');
      if (card) wrapper.appendChild(card);
      this._bootMark(wrapper, i);
      container.appendChild(wrapper);

      this._cards.push(card);
      this._wrappers.push(wrapper);

      if (card) card.hass = this._hass;

      if (i < this._config.cards.length - 1 && performance.now() - budget > 8) {
        await yieldFrame();
        budget = performance.now();
        // Weggeräumt (z. B. Weiterleitung Handy ↔ Desktop): nicht weiterbauen –
        // Karten außerhalb eines Dashboards finden ihre Vorlagen nicht.
        if (!this.isConnected) { this._initializing = false; return; }
      }
    }

    const painted = this._cards.filter(Boolean)
      .map((c) => c.updateComplete).filter((p) => p && typeof p.then === 'function');
    if (painted.length) { try { await Promise.all(painted); } catch (e) {} }
    // A timer, not a frame: requestAnimationFrame does not fire in a background
    // tab, and the row must never wait on one to become visible.
    await new Promise((r) => setTimeout(r, 0));
    this._builtAt = Date.now();
    rowLog('revealed', {});

    this._cardsCreated = true;
    this._initializing = false;

    container.addEventListener('pointerdown', () => {
      if (this._sortTimer !== null) this._scheduleSort();
    }, { passive: true });

    setTimeout(() => {
      this._wrappers.forEach((wrapper, i) => {
        if (!this._isCardHidden(this._cards[i], wrapper)) return;
        wrapper.style.display = 'none';
        // Seeded so the first reveal reads as a transition and animates open.
        this._hiddenState[i] = true;
      });

      const active = [], inactive = [];
      this._config.cards.forEach((_, i) => {
        (this._isActive(i) ? active : inactive).push(i);
      });
      const order = [...active, ...inactive];

      this._activeSet       = new Set(active);
      this._activationOrder = [...active];

      // Active cards move to the front, keeping config order among themselves.
      order.forEach((origIdx, pos) => { this._wrappers[origIdx].style.order = pos; });
      this._casoraSnapBack();
      // Inline on the wrapper, so it beats anything inherited.
      order.forEach((origIdx, sortedPos) => {
        this._wrappers[origIdx].style.setProperty('--casora-anim-delay',
          `${(sortedPos * 0.04).toFixed(2)}s`);
      });

      if (!!window._casoraFromBg) {
        this._wrappers.forEach(w => w.style.removeProperty('--casora-init-play'));
        this._initialized = true;
        this._updateWrapperVisibility();
        return;
      }

      const release = () => {
        this._wrappers.forEach(w => w.style.removeProperty('--casora-init-play'));
        setTimeout(() => {
          this._initialized = true;
          // Nur ein hass-Update löst sonst einen Durchgang aus: eine von Anfang an aktive
          // show_when-Kachel würde bis dahin zurückgehalten (Hemma 2.2.0).
          this._updateWrapperVisibility();
          setTimeout(() => this._updateSort(), 2000);
          setTimeout(() => this._updateSort(), 5000);
        }, PAGE_ANIM_MS);
      };

      if (window.requestIdleCallback) window.requestIdleCallback(release, { timeout: 500 });
      else requestAnimationFrame(() => requestAnimationFrame(release));

    }, 100);
  }

  // ── Active detection ────────────────────────────────────────────────────────

  _findHaCard(el, depth = 0) {
    if (!el || depth > 6) return null;
    if (el.tagName === 'HA-CARD') return el;
    const roots = el.shadowRoot ? [el.shadowRoot, el] : [el];
    for (const root of roots) {
      for (const kid of root.children || []) {
        const found = this._findHaCard(kid, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  _isActiveByDom(index) {
    const card = this._cards[index];
    if (!card) return null;
    let ha = this._haCards[index];
    if (!ha || !ha.isConnected) {
      ha = this._findHaCard(card);
      this._haCards[index] = ha;
    }
    if (!ha) return null;
    let v = ha.style.getPropertyValue('--casora-active-overlay-opacity').trim();
    if (!v) v = getComputedStyle(ha).getPropertyValue('--casora-active-overlay-opacity').trim();
    if (!v) return null;
    return v === '1';
  }

  _isActiveByState(index) {
    const cfg = resolveCardConfig(this._config.cards[index]);
    if (cardFlag(cfg, 'full_width')) return false;
    if (!this._hass) return false;
    const isOn = (eid) => {
      const st = this._hass.states[eid];
      return st ? activeStates().has((st.state || '').toLowerCase()) : false;
    };
    // casora-local-patch: Karten ohne einzelnes Entity (auto-entities/Swipe-Karussell) melden
    // über active_entities, ob sie aktiv sind (eine davon aktiv genügt).
    if (Array.isArray(cfg?.active_entities) && cfg.active_entities.length) return cfg.active_entities.some(isOn);
    if (!cfg?.entity) return false;
    return isOn(cfg.entity);
  }

  _isActive(index) {
    if (this._heldClosed(index)) return false;
    if (this._isCardHidden(this._cards[index], this._wrappers[index])) return false;
    // casora-local-patch: always_active verankert eine Karte vorne in der Aktiv-Gruppe (Kamera-Karussell).
    if (cardFlag(resolveCardConfig(this._config.cards[index]), 'always_active')) return true;
    const dom = this._isActiveByDom(index);
    return dom !== null ? dom : this._isActiveByState(index);
  }

  // ── Sort logic ──────────────────────────────────────────────────────────────

  _seedFromDom() {
    const active = [];
    this._config.cards.forEach((_, i) => {
      if (this._isActive(i)) active.push(i);
    });

    this._activeSet       = new Set(active);
    this._activationOrder = active;
  }

  _updateSort() {
    if (!this._sortEnabled || !this._wrappers.length) return;

    const newActive = new Set();
    this._config.cards.forEach((_, i) => {
      if (this._isActive(i)) newActive.add(i);
    });

    let changed = false;
    for (const i of newActive)      { if (!this._activeSet.has(i)) { changed = true; break; } }
    if (!changed) for (const i of this._activeSet) { if (!newActive.has(i)) { changed = true; break; } }
    if (!changed) return;

    this._activationOrder = [...newActive].sort((a, b) => a - b);
    this._activeSet = newActive;

    this._scheduleSort();
  }

  _scheduleSort() {
    if (!this._sortEnabled) return;
    if (this._sortTimer) clearTimeout(this._sortTimer);
    const delay = window._casoraNoFilterAnim ? 100 : SORT_DELAY_MS;
    this._sortTimer = setTimeout(() => {
      this._sortTimer = null;
      this._applyOrder(true);
    }, delay);
  }

  // ── FLIP animation ──────────────────────────────────────────────────────────

  // Casora (26.09.2026): Nach dem Umsortieren rastet der Browser per scroll-snap
  // wieder auf der Kachel ein, die vorher vorne stand – die Reihe stand dann
  // nach dem Laden ~700 px weit gescrollt, aktive Kacheln lagen links außerhalb.
  // Am Desktop zurück an den Anfang, solange niemand selbst gescrollt hat.
  _casoraSnapBack() {
    if (!isDesktop()) return;
    if (!this._casoraTouched) {
      this._casoraTouched = true;
      const mark = () => { this._casoraUserScroll = Date.now(); };
      ['wheel', 'pointerdown', 'touchstart', 'keydown'].forEach((t) => this.addEventListener(t, mark, { passive: true }));
    }
    const go = () => {
      if (Date.now() - (this._casoraUserScroll || 0) < 3000) return;
      if (this.scrollLeft > 10) this.scrollTo({ left: 0, behavior: 'instant' });
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 450);
  }

  _applyOrder(animate) {
    if (!this._wrappers.length) return;
    rowLog('applyOrder', { animate: !!animate,
      sinceBuilt: Date.now() - (this._builtAt || 0),
      noFilterAnim: !!window._casoraNoFilterAnim });

    const inactive = this._config.cards.map((_, i) => i).filter(i => !this._activeSet.has(i));
    const newOrder  = [...this._activationOrder, ...inactive];

    if (!animate || window._casoraNoFilterAnim) {
      newOrder.forEach((origIdx, pos) => { this._wrappers[origIdx].style.order = pos; });
      if (isDesktop()) this.scrollTo({ left: 0, behavior: 'instant' });
      this._casoraSnapBack();
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      newOrder.forEach((origIdx, pos) => { this._wrappers[origIdx].style.order = pos; });
      if (isDesktop()) this.scrollTo({ left: 0, behavior: 'instant' });
      this._casoraSnapBack();
      return;
    }

    const firstRects = this._wrappers.map(w => w.getBoundingClientRect());
    newOrder.forEach((origIdx, pos) => { this._wrappers[origIdx].style.order = pos; });
    this._casoraSnapBack();
    const lastRects = this._wrappers.map(w => w.getBoundingClientRect());

    if (isDesktop() && this.scrollLeft > 10) {
      this.scrollTo({ left: 0, behavior: 'smooth' });
    }

    const deltas = this._wrappers.map((_, i) => ({
      dx: firstRects[i].left - lastRects[i].left,
      dy: firstRects[i].top  - lastRects[i].top,
    }));

    this._wrappers.forEach(w => w.style.setProperty('--hsr-anim-paused', 'paused'));

    deltas.forEach(({ dx, dy }, i) => {
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      this._wrappers[i].style.transition = 'none';
      this._wrappers[i].style.transform  = `translate(${dx}px, ${dy}px)`;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        deltas.forEach(({ dx, dy }, i) => {
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
          const toFront = dx > 0 || dy > 0;
          this._wrappers[i].style.transition =
            `transform ${SORT_MS}ms ${toFront ? EASE_FORWARD : EASE_BACK} ${toFront ? 0 : STAGGER_MS}ms`;
          this._wrappers[i].style.transform = '';
        });

        setTimeout(() => {
          this._wrappers.forEach(w => {
            w.style.transition = '';
            w.style.removeProperty('--hsr-anim-paused');
          });
        }, SORT_MS + STAGGER_MS + 50);
      });
    });
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  _css() {
    return `
      :host {
        --hsr-rail: var(--casora-entity-left-inset-current, var(--casora-entity-left-inset-desktop, var(--casora-rail-left, var(--page-gutter, 8vw))));
        display: block;
        position: absolute;
        z-index: 3;
        /* Rail lives in the container's padding, so cards leave at the display
           edge instead of clipping on a line mid-screen. */
        inset: auto
          var(--casora-entity-right-inset-current, var(--casora-entity-right-inset-desktop, var(--casora-rail-left, var(--page-gutter, 8vw))))
          var(--casora-entity-bottom-current, var(--casora-entity-bottom-desktop, 0px))
          0;
        scroll-padding-left: var(--hsr-rail);
        box-sizing: border-box;
        overflow-x: auto;
        overflow-y: clip;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x;
        /* contain statt auto: am Anfang der Reihe lief das Touchpad-Wischen nach links (samt
           Ausrollen) sonst an die Seite weiter und startete die Zurück-Geste des Browsers
           (Safari/Chrome am Mac) – die Reihe hing am Ende des Zurückwischens (05.10.2026).
           Nach rechts gibt es meist keine Vorwärts-Seite, darum fiel es nur rückwärts auf. */
        overscroll-behavior-x: contain;
        overscroll-behavior-y: none;
        overflow-anchor: none;
        scrollbar-width: none;
        -ms-overflow-style: none;
        direction: ltr;
      }
      :host::-webkit-scrollbar { display: none; }
      /* Einrasten nur bei Touch. Mit Touchpad/Mausrad zog proximity-Snap die Reihe bei jedem
         Wischschritt zur letzten Kachelkante zurück (Chromium) bzw. hielt sie fest und rastete
         nach dem Loslassen nach (WebKit) – das Wischen fühlte sich hakelig an (05.10.2026). */
      @media (pointer: coarse) { :host { scroll-snap-type: x proximity; } }
      /* Weicher Rand, wo noch Kacheln liegen (30.09.2026) – bewusst OHNE mask-image auf der
         Reihe: eine Maske macht sie zur Backdrop-Wurzel, dann blurren die Glas-Kacheln darin
         nicht mehr den Hintergrund. Stattdessen liegen zwei Schleier (#fade .l/.r) über den
         Rändern: eigener backdrop-filter, dessen Maske nur den Schleier selbst ausblendet
         (zum Rand hin zunehmende Unschärfe). Sie nehmen keine Klicks an und stehen per
         position: sticky still, während die Kacheln darunter durchlaufen. */
      #track {
        display: grid;
        width: max-content;
        min-width: 100%;
      }
      #track > #container, #track > #fade, #track > #arrows { grid-area: 1 / 1; }
      #arrows {
        display: var(--casora-row-arrows, none);
        position: sticky;
        left: 0;
        z-index: 3;
        width: var(--hsr-view, 100%);
        pointer-events: none;
      }
      #arrows > button {
        position: absolute;
        /* Mitte der Kacheln: Spur oben 20px, unten der Zeilenabstand */
        top: calc(20px + (100% - 20px - var(--casora-entity-row-pad-bottom-current, 40px)) / 2);
        width: 44px;
        height: 44px;
        margin: -22px 0 0;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--casora-row-arrow-fill, var(--casora-nav-more-fill, rgba(255, 255, 255, 0.92)));
        box-shadow: var(--button-card-box-shadow, 0 6px 18px rgba(0, 0, 0, 0.16));
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s;
        -webkit-tap-highlight-color: transparent;
      }
      #arrows > button::before {
        content: "";
        position: absolute;
        inset: 0;
        margin: auto;
        width: 20px;
        height: 20px;
        background-color: var(--casora-row-arrow-ink, var(--casora-nav-chevron, rgba(58, 50, 43, 0.7)));
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 5.5l6.5 6.5L9 18.5' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 5.5l6.5 6.5L9 18.5' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
      }
      #arrows > .l { left: 16px; }
      #arrows > .l::before { transform: rotate(180deg); }
      #arrows > .r { right: 16px; }
      :host([casora-more-l]) #arrows > .l,
      :host([casora-more-r]) #arrows > .r { opacity: 1; visibility: visible; }
      :host([casora-row-mode]:not([casora-row-mode="arrows"])) #arrows { display: none; }
      /* Variante „fade“: Seitenpunkte mittig unter der Reihe, im unteren Zeilenabstand. */
      #track > #dots { grid-area: 1 / 1; }
      #dots {
        display: none;
        position: sticky;
        left: 0;
        z-index: 3;
        width: var(--hsr-view, 100%);
        align-self: end;
        justify-content: center;
        gap: 2px;
        box-sizing: border-box;
        padding-left: var(--hsr-rail);
        height: var(--casora-entity-row-pad-bottom-current, 40px);
        align-items: center;
        pointer-events: none;
      }
      :host([casora-row-mode="fade"]) #dots { display: flex; }
      #dots > button {
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        pointer-events: auto;
        display: grid;
        place-items: center;
        -webkit-tap-highlight-color: transparent;
      }
      #dots > button::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 3px;
        background: var(--casora-row-dot, var(--casora-text-2, rgba(58, 50, 43, 0.6)));
        opacity: 0.32;
        transition: width 0.25s ease, opacity 0.25s ease;
      }
      #dots > button.on::before { width: 16px; opacity: 0.8; }
      #dots > button.on { width: 26px; }
      /* Variante „more“: Reihe blättert nicht frei, ausgeblendete Kacheln fehlen ganz. */
      :host([casora-row-mode="more"]) { overflow-x: hidden; scroll-snap-type: none; }
      .card-wrapper[data-casora-page-off] { display: none !important; }
      /* „fade“: die maskierte Hülle bekommt rundum Platz für den Kachelschatten (gleich großer
         negativer Außenabstand, Layout bleibt gleich). Die Maske reicht so über den Schatten,
         der nicht mehr an der Box abbricht. Klicks nimmt nur die Kachel, nicht der Rand. */
      :host([casora-scrolling]) .card-wrapper,
      :host([casora-scrolling]) .card-wrapper * { pointer-events: none !important; }
      :host([casora-row-mode="fade"]) .card-wrapper[data-casora-fade] {
        box-sizing: content-box;
        padding: 48px;
        margin: -48px;
        /* Einrasten weiter an der Kachelkante, nicht am Schattenrand. */
        scroll-margin: -48px;
        pointer-events: none;
      }
      :host([casora-row-mode="fade"]) .card-wrapper[data-casora-fade] > * { pointer-events: auto; }
      #more { display: none; }
      :host([casora-row-mode="more"]) #more[data-on] {
        display: flex;
        flex: 0 0 132px;
        align-self: stretch;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        box-sizing: border-box;
        border-radius: var(--ha-card-border-radius, 24px);
        background: var(--casora-row-more-fill, var(--ha-card-background, var(--card-background-color)));
        box-shadow: var(--button-card-box-shadow, none);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        color: var(--casora-text-1, var(--primary-text-color));
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        animation: hsr-more-in 0.3s ease both;
      }
      #more > b { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
      #more > span { font-size: 14px; font-weight: 500; color: var(--casora-text-2, var(--secondary-text-color)); display: flex; align-items: center; gap: 2px; }
      #more > span::after {
        content: "";
        width: 14px;
        height: 14px;
        background-color: currentColor;
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 5.5l6.5 6.5L9 18.5' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 5.5l6.5 6.5L9 18.5' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
      }
      #more[data-on="back"] > b { display: none; }
      #more[data-on="back"] > span { flex-direction: row-reverse; }
      #more[data-on="back"] > span::after { transform: rotate(180deg); }
      @keyframes hsr-more-in { from { opacity: 0; } to { opacity: 1; } }
      #fade {
        position: sticky;
        left: 0;
        z-index: 2;
        width: var(--hsr-view, 100%);
        pointer-events: none;
      }
      #fade > i {
        --hsr-fade-w: clamp(56px, 8vw, 120px);
        position: absolute;
        top: 20px;
        bottom: var(--casora-entity-row-pad-bottom-current, 40px);
        width: var(--hsr-fade-w);
        opacity: 0;
        pointer-events: none;
        -webkit-backdrop-filter: blur(26px);
        backdrop-filter: blur(26px);
        transition: opacity 0.25s ease;
      }
      /* Nur Unschärfe, keine Tönung: wo keine Kachel liegt, bleibt der Schleier unsichtbar
         (das Raumfoto ist dort ohnehin weich). */
      #fade > .l {
        left: 0;
        -webkit-mask-image: linear-gradient(to right, #000, #000 35%, rgba(0, 0, 0, 0.7) 65%, transparent);
        mask-image: linear-gradient(to right, #000, #000 35%, rgba(0, 0, 0, 0.7) 65%, transparent);
      }
      #fade > .r {
        right: 0;
        -webkit-mask-image: linear-gradient(to left, #000, #000 35%, rgba(0, 0, 0, 0.7) 65%, transparent);
        mask-image: linear-gradient(to left, #000, #000 35%, rgba(0, 0, 0, 0.7) 65%, transparent);
      }
      /* Kein Rand-Effekt (30.09.): Schleier bleibt ausgeblendet. */
      #fade { display: none; }
      @media (prefers-reduced-motion: reduce) {
        #fade > i { transition: none; }
      }

      /* A tablet anchors the row to the SCREEN, not to the flow. Absolute
         positioning hands the bottom edge to whatever containing block the view
         ends up with, which on an iPad stopped 56px short of the display and no
         padding value could reach past it. Desktop is left alone: its own
         containing block does reach the bottom, which is why its gutter reads
         right and this one did not. Run ?casorarowprobe=1 to see the boxes.
         The screen edge is the panel's: a docked HA sidebar would otherwise
         cover the first tile (--casora-content-left, layout-offsets.js). */
      @media (min-width: 768px) and (max-width: 1600px) and (min-height: 501px) and (pointer: coarse),
             (min-width: 768px) and (max-width: 1600px) and (min-height: 501px) and (hover: none) {
        :host { position: fixed; left: var(--casora-content-left, 0px); }
      }

      /* Only the wrappers take taps, so the host can't block the navbar. */
      .card-wrapper { pointer-events: auto; }

      #container {
        display: flex;
        flex-direction: row;
        align-items: flex-end;
        gap: var(--casora-tile-row-gap-desktop, 8px);
        padding: 20px calc(var(--casora-entity-shadow-pad-right-current, var(--casora-entity-shadow-pad-right-desktop, 0px))
          + var(--casora-entity-row-pad-end-current, 0px)) var(--casora-entity-row-pad-bottom-current, 40px) var(--hsr-rail);
        min-width: max-content;
        box-sizing: border-box;
      }

      .empty-hint {
        display: var(--casora-empty-row-display, none);
        align-items: center;
        gap: 10px;
        box-sizing: border-box;
        height: 62px;
        padding: 0 24px 0 18px;
        border-radius: 24px;
        background: var(--casora-empty-row-fill, transparent);
        box-shadow: var(--casora-empty-row-shadow, none);
        color: var(--casora-text-2, var(--secondary-text-color));
        font-size: 14.5px;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        pointer-events: auto;
        -webkit-tap-highlight-color: transparent;
      }
      .empty-hint ha-icon { --mdc-icon-size: 20px; color: var(--casora-tone-general, currentColor); }

      .card-wrapper {
        flex: 0 0 var(--casora-entity-col-width-current, var(--casora-entity-col-width-desktop, 300px));
        width: var(--casora-entity-col-width-current, var(--casora-entity-col-width-desktop, 300px));
        scroll-snap-align: start;
      }

      /* Phones reach this row only through the mobile dashboard, so portrait
         and landscape share one in-flow scrolling layout. */
      @media (max-width: 767px) and (orientation: portrait),
             (max-height: 500px) and (orientation: portrait),
             (max-height: 600px) and (orientation: landscape) {
        :host {
          position: relative;
          z-index: auto;
          inset: auto;
          display: block;
          width: 100%;
          overflow: visible;
          touch-action: auto;
          overscroll-behavior: auto;
          pointer-events: auto;
        }
        #container {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-content: start;
          gap: 8px;
          padding: ${this._rowPadding || '0'};
          min-width: unset;
          overflow: visible;
          box-sizing: border-box;
          ${this._sortEnabled ? `
          /* Fixed tracks make a large tile exactly two small ones tall and give
             a row-spanning item an unambiguous height. Dense backfills the hole
             a large tile leaves beside it. */
          grid-auto-rows: var(--casora-tile-row-h-current, 66px);
          grid-auto-flow: row dense;
          /* Kachelabstand im Raster (der Look darf ihn setzen, Standard 8px). */
          gap: var(--casora-tile-row-gap-mobile, 8px);
          align-items: stretch;
          ` : `
          /* Outer row: weather, badges, headers, Now Playing all size to content. */
          grid-auto-rows: min-content;
          align-items: start;
          `}
        }
        .card-wrapper { flex: unset; width: auto; scroll-snap-align: none; will-change: auto; }
        /* Handy: die Reihe blättert nicht, sie ist ein Raster im Fluss – kein Rand. */
        #track { display: block; width: auto; min-width: 0; }
        #fade, #arrows, #dots, #more { display: none !important; }
        ${this._sortEnabled ? `
        /* Child combinator load-bearing - see the collapsed-spacer rule below. */
        #container > .card-wrapper[data-size="large"] { grid-row: span 2; }
        /* Passes the track height down for the card's own height:100%. */
        #container > .card-wrapper > * { display: block; height: 100%; }
        /* Bedingte Karte (conditional): HA legt die Kachel in ein inline-hui-card, dort
           griff height:100% nicht und die Kachel nahm ihre Eigenhöhe (Alarm-Kachel 4-9 px
           höher als die Spur, der Abstand darunter schrumpfte). Höhe bis zur Kachel durchreichen. */
        #container > .card-wrapper > hui-conditional-card > hui-card,
        #container > .card-wrapper > hui-conditional-card > hui-card > * { display: block; height: 100%; }
        /* And holds a pasted card to it. Safari leaks past overflow alone. */
        #container > .card-wrapper[data-raw="1"] {
          overflow: hidden;
          border-radius: var(--casora-tile-radius-phone, 26px);
          clip-path: inset(0 round var(--casora-tile-radius-phone, 26px));
        }
        /* That display beats the hidden attribute's UA display:none, so a card
           that has turned itself off still paints whenever its wrapper is open.
           Collapsing the wrapper is what normally keeps it off screen, and that
           is a JS pass with retries - it has a window. This closes it. */
        #container > .card-wrapper > *[hidden] { display: none; }
        ` : ''}
        .card-wrapper[data-fullwidth="1"] { grid-column: 1 / -1 !important; width: 100% !important; flex: none !important; }
        /* Leere Wiedergabe-Reihe: ein negativer Rand an ihr selbst verschob sie nur in ihrer
           Spur, der doppelte Zeilenabstand blieb (+8 px über dem nächsten Abschnitt). Darum den
           Nachfolger hochziehen (Hemma 2.2.0, MIT). */
        #container > .card-wrapper:has([data-casora-np]) + .card-wrapper {
          transition: margin-top 0.5s cubic-bezier(0.32, 0.72, 0, 1);
        }
        #container > .card-wrapper:has([data-casora-np-empty]) + .card-wrapper {
          margin-top: -8px;
        }
        #container > .card-wrapper[data-collapsed-spacer] {
          display: none;
        }
        .card-wrapper[data-off] { display: none !important; }
      }

      /* Landscape has enough width for a third column of entity cards. */
      @media (max-height: 600px) and (orientation: landscape) {
        #container { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }

      /* Erstes Laden am Handy: verdeckt, bis Home aufgeräumt ist (_bootSetup). */
      :host([casora-boot]) #container > .card-wrapper[data-boot-veil] { visibility: hidden; }
      /* Die Punkte sitzen in der ersten Überschrift: dort nur deren Karte ausblenden. */
      :host([casora-boot]) #container > .card-wrapper[data-boot-veil]:not([data-boot-first]),
      :host([casora-boot]) #container > .card-wrapper[data-boot-first] > :not(.casora-boot-wait) { opacity: 0; }
      :host([casora-boot-out]) #container > .card-wrapper[data-boot-veil],
      :host([casora-boot-out]) #container > .card-wrapper[data-boot-first] > * { transition: opacity 0.35s ease; }
      :host([casora-boot]) #container > .card-wrapper[data-boot-first] { position: relative; }
      #container > .card-wrapper > .casora-boot-wait {
        position: absolute; left: 0; right: 0; top: 30px; height: auto !important;
        display: flex; justify-content: center; gap: 7px;
        visibility: visible; pointer-events: none; opacity: 0;
        animation: casora-boot-in 0.4s ease 0.3s forwards;
      }
      :host(:not([casora-boot])) #container > .card-wrapper > .casora-boot-wait { display: none; }
      .casora-boot-wait i {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--primary-text-color, #fff);
        animation: casora-boot-dot 1.2s ease-in-out infinite;
      }
      .casora-boot-wait i:nth-child(2) { animation-delay: 0.15s; }
      .casora-boot-wait i:nth-child(3) { animation-delay: 0.3s; }
      @keyframes casora-boot-in { to { opacity: 1; } }
      @keyframes casora-boot-dot {
        0%, 80%, 100% { opacity: 0.18; transform: scale(0.8); }
        40% { opacity: 0.6; transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .casora-boot-wait i { animation: none; opacity: 0.4; }
      }
    `;
  }
}

customElements.define('casora-smart-row', CasoraSmartRow);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'casora-smart-row',
  name: 'Casora Smart Row',
  description: 'Smart entity row — active cards slide to the front on desktop',
});
