// casora-swipe-card.js
//
// Minimal swipe/carousel card built for Casora, replacing simple-swipe-card
// for spots that need to be a "large" tile in casora-smart-row's mobile grid
// (see smart-row.js's _stampLargeFill/data-size="large" system).
//
// Why not simple-swipe-card: it measures and sets its OWN height in JS on
// mount (auto_height:false only skips the smooth-transition path, it still
// self-measures once) and that plain inline style write always wins over
// smart-row.js's external height:100% stamp, no matter how often or when the
// stamp re-applies — confirmed 06.09.2026 after three different stamping
// strategies (delayed retries, MutationObserver, a 600ms interval) all lost
// that fight. Even a forced `:host{height:...!important}` card_mod override
// didn't hold up reliably in testing.
//
// This card never measures itself: :host is height:100%/width:100% from its
// own stylesheet, full stop — the height comes from whatever the parent grid
// cell gives it, exactly like every plain casora_* button-card already
// behaves. That's what makes it compatible with the "large" system with no
// fighting and no !important needed.
//
// Config:
//   type: custom:casora-swipe-card
//   cards: [...]                     # required, the slides, in order
//   auto_swipe_interval: 10000       # ms between auto-advances; omit/0 disables
//   show_pagination: true            # default true when cards.length > 1
//   dot_color: 'rgba(255,255,255,0.5)'
//   dot_active_color: 'rgba(255,255,255,0.95)'
//   dot_size: 6                      # px
//   always_active: true              # passthrough — read by smart-row.js's
//                                     # cardFlag(), not by this card itself;
//                                     # keeps the tile pinned to the front of
//                                     # a sorted row regardless of state.

class CasoraSwipeCard extends HTMLElement {
  setConfig(config) {
    if (!config || !Array.isArray(config.cards) || config.cards.length < 1) {
      throw new Error('casora-swipe-card: cards array required');
    }
    this._config = config;
    this._index = 0;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    (this._cards || []).forEach((c) => { if (c) c.hass = hass; });
  }

  get hass() { return this._hass; }

  connectedCallback() {
    this._startAutoSwipe();
  }

  disconnectedCallback() {
    clearInterval(this._autoTimer);
  }

  async _build() {
    if (this._building || this._built) return;
    this._building = true;

    if (!window.loadCardHelpers) {
      requestAnimationFrame(() => { this._building = false; this._build(); });
      return;
    }
    const helpers = await window.loadCardHelpers();

    const root = this.shadowRoot;
    root.innerHTML = '';

    const dotColor       = this._config.dot_color        || 'rgba(255,255,255,0.5)';
    const dotActiveColor = this._config.dot_active_color  || 'rgba(255,255,255,0.95)';
    const dotSize         = Number(this._config.dot_size) || 6;

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        position: relative;
        height: 100%;
        width: 100%;
        /* 04.10.2026: kein eckiges overflow:hidden mehr – es schnitt den Schatten der Kachel
           an einer rechteckigen Kante ab (eckiger Schatten unten, harter Rand rechts). Der
           Ausschnitt reicht oben/unten weit und seitlich halb so weit wie der Abstand zwischen
           den Karten: der Schatten bleibt ganz, die Nachbarkarte bleibt verborgen. */
        overflow: visible;
        clip-path: inset(-48px calc(var(--casora-swipe-gap, 64px) / -2 + 1px));
        /* Senkrecht scrollt der Browser (Seite/Overlay), waagerecht übernimmt _attachGestures. */
        touch-action: pan-y;
        -webkit-user-select: none;
        user-select: none;
      }
      /* will-change nur während des Ziehens (setzt _attachGestures), nicht dauerhaft. */
      #track {
        display: flex;
        gap: var(--casora-swipe-gap, 64px);
        height: 100%;
        width: 100%;
      }
      #track.animate { transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1); }
      .slide {
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        overflow: visible;
      }
      .slide > * { display: block; height: 100%; width: 100%; }
      /* Oben mittig im Innenabstand statt unten (01.10.2026): unten lagen die Punkte auf
         dem Untertitel der flachen Handy-Kachel („49 % Feuchtigkeit“). Oben mittig ist bei
         flachen wie großen Kacheln frei (Symbol links, Schalter rechts). */
      /* Punkte antippbar (03.10.2026): jeder Punkt hat eine 10 px größere, unsichtbare
         Trefferfläche; sie überlappen sich, damit der sichtbare Abstand 5 px bleibt. */
      #dots {
        position: absolute;
        left: 50%;
        top: calc(var(--casora-swipe-dots-top, 6px) - 5px);
        transform: translateX(-50%);
        display: flex;
        z-index: 2;
        pointer-events: auto;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .dot {
        width: ${dotSize + 10}px;
        height: ${dotSize + 10}px;
        margin: 0 -2.5px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dot::after {
        content: '';
        width: ${dotSize}px;
        height: ${dotSize}px;
        border-radius: 50%;
        background: ${dotColor};
        transition: background-color 0.25s ease, transform 0.25s ease;
      }
      .dot.active::after {
        background: ${dotActiveColor};
        transform: scale(1.15);
      }
    `;
    root.appendChild(style);

    const track = document.createElement('div');
    track.id = 'track';
    root.appendChild(track);
    this._track = track;

    this._cards = this._config.cards.map((cfg) => {
      let card = null;
      try {
        card = helpers.createCardElement(cfg);
        card.hass = this._hass;
      } catch (e) {
        console.warn('casora-swipe-card: failed to create card', cfg, e);
      }
      const slide = document.createElement('div');
      slide.className = 'slide';
      if (card) slide.appendChild(card);
      track.appendChild(slide);
      return card;
    });

    const showDots = this._config.show_pagination !== false && this._cards.length > 1;
    if (showDots) {
      const dots = document.createElement('div');
      dots.id = 'dots';
      this._dots = this._cards.map((_, i) => {
        const d = document.createElement('div');
        d.className = 'dot';
        // Tippen auf einen Punkt springt zu dieser Karte (die Kachel darunter öffnet nichts).
        d.addEventListener('click', (e) => {
          e.stopPropagation();
          this._goTo(i, true, false);
          this._startAutoSwipe();
        });
        dots.appendChild(d);
        return d;
      });
      root.appendChild(dots);
    }

    this._attachGestures();
    this._goTo(0, false);
    this._startAutoSwipe();
    this._built = true;
    this._building = false;

    // Plain casora_* button-cards don't self-measure/override their own
    // height the way the third-party swipe card did, so — unlike
    // smart-row.js's ongoing fight — one stamp pass, retried a few times
    // for async shadow-root creation, is permanent. See smart-row.js's own
    // _stampLargeFill for the identical technique and why it's needed at
    // all (a stylesheet can't cross a shadow boundary, so a wrapped card's
    // height:100% has to be applied by hand down to its ha-card).
    const stamp = () => this._cards.forEach((c) => this._stampFill(c));
    requestAnimationFrame(stamp);
    setTimeout(stamp, 400);
    setTimeout(stamp, 1200);
  }

  _stampFill(el, depth = 0) {
    if (!el || depth > 16) return false;
    if (el.tagName === 'HA-CARD') return true;
    if (el.style && el.style.display === 'none') return false;

    let onPath = false;
    const roots = el.shadowRoot ? [el.shadowRoot, el] : [el];
    for (const root of roots) {
      for (const kid of root.children || []) {
        if (this._stampFill(kid, depth + 1)) onPath = true;
      }
    }
    if (onPath && depth > 0 && el.tagName && el.tagName.includes('-')) {
      if (getComputedStyle(el).display === 'inline') el.style.display = 'block';
      el.style.height    = '100%';
      el.style.flexGrow  = '1';
      el.style.minHeight = '0';
    }
    return onPath;
  }

  // wrap: nur das automatische Weiterblättern läuft im Kreis; Wischen und Punkte bleiben
  // an den Enden stehen (dort übernimmt die Kachelreihe, siehe _attachGestures).
  _goTo(index, animate = true, wrap = true) {
    if (!this._track || !this._cards.length) return;
    const n = this._cards.length;
    this._index = wrap ? ((index % n) + n) % n : Math.max(0, Math.min(n - 1, index));
    this._track.classList.toggle('animate', animate);
    this._track.style.transform = `translateX(calc(${this._index} * (-100% - var(--casora-swipe-gap, 64px))))`;
    (this._dots || []).forEach((d, i) => d.classList.toggle('active', i === this._index));
  }

  _startAutoSwipe() {
    clearInterval(this._autoTimer);
    const interval = Number(this._config?.auto_swipe_interval);
    if (!interval || !this._cards || this._cards.length <= 1) return;
    this._autoTimer = setInterval(() => {
      if (this._dragging) return;
      this._goTo(this._index + 1);
    }, interval);
  }

  // Die umgebende Kachelreihe: nächster Vorfahr (auch über Shadow-Grenzen), der seitwärts
  // scrollen kann. Am Handy (Raster) und im Raum-Overlay gibt es keine – dann null.
  _row() {
    let el = this.parentNode;
    while (el) {
      if (el.nodeType === 11) { el = el.host; continue; }
      if (el.nodeType === 1 && el !== document.documentElement && el !== document.body) {
        const ox = getComputedStyle(el).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) return el;
      }
      el = el.parentNode;
    }
    return null;
  }

  // Der Klick nach einem Wisch/Ziehen öffnet kein Popup. Maus: der Klick folgt sofort auf
  // pointerup; Touch: er käme (wenn überhaupt) kurz nach touchend.
  _eatClick(ms) {
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, true), ms);
  }

  // Gesten (03.10.2026, verschachteltes Karussell wie iOS):
  //  - Richtung erst nach 8 px festlegen, dann für die ganze Geste sperren.
  //  - Senkrecht gehört immer dem Browser (touch-action: pan-y, nie preventDefault) – die
  //    Seite bzw. das Raum-Overlay scrollt nativ.
  //  - Waagerecht blättert der Stapel. Will die Geste am Anfang nach rechts bzw. am Ende nach
  //    links, scrollt stattdessen die Kachelreihe (mit Schwung); ohne Reihe federt der Stapel.
  //  - Maus-Ziehen genauso; smart-row.js übernimmt das Ziehen hier nicht (data-casora-nodrag).
  //  - Mausrad/Trackpad: senkrecht unverändert (Seite bzw. Reihe wie bei jeder Kachel),
  //    seitwärts eine Karte je Wischbewegung, am Stapelende scrollt die Reihe nativ.
  _attachGestures() {
    if (this._gesturesOn) return;
    this._gesturesOn = true;
    const host = this;
    host.setAttribute('data-casora-nodrag', '');
    const SLOP = 8;
    let g = null;
    let glide = null;

    const stopGlide = () => {
      if (!glide) return;
      cancelAnimationFrame(glide.raf);
      glide.row.style.scrollSnapType = '';
      glide = null;
    };
    const startGlide = (row, v) => {
      glide = { row, raf: 0 };
      const step = () => {
        const before = row.scrollLeft;
        if (Math.abs(v) >= 0.5) row.scrollLeft = before + v;
        if (Math.abs(v) < 0.5 || row.scrollLeft === before) { stopGlide(); return; }
        v *= 0.94;
        glide.raf = requestAnimationFrame(step);
      };
      glide.raf = requestAnimationFrame(step);
    };

    const begin = (x, y, kind) => {
      stopGlide();
      g = { kind, x0: x, y0: y, x, y, dx: 0, vx: 0, t: performance.now(), phase: 'pending', owner: null };
      this._dragging = true;
    };
    const decide = () => {
      const adx = Math.abs(g.dx), ady = Math.abs(g.y - g.y0);
      if (adx < SLOP && ady < SLOP) return false;
      if (ady > adx) { g.phase = 'vertical'; this._dragging = false; return true; }
      g.phase = 'horizontal';
      const n = this._cards.length;
      const prev = g.dx > 0;
      const atEdge = prev ? this._index === 0 : this._index === n - 1;
      const row = atEdge ? this._row() : null;
      if (row) {
        const max = row.scrollWidth - row.clientWidth;
        if (prev ? row.scrollLeft > 1 : row.scrollLeft < max - 1) {
          g.owner = 'row'; g.row = row; g.rowStart = row.scrollLeft;
          row.style.scrollSnapType = 'none';
          return true;
        }
      }
      g.owner = 'stack';
      this._track.classList.remove('animate');
      this._track.style.willChange = 'transform';
      return true;
    };
    const move = (x, y, ev) => {
      if (!g || g.phase === 'vertical') return;
      const now = performance.now();
      const dt = Math.max(1, now - g.t);
      g.vx = 0.8 * ((x - g.x) / dt) + 0.2 * g.vx;
      g.t = now; g.x = x; g.y = y;
      g.dx = x - g.x0;
      if (g.phase === 'pending' && !decide()) return;
      if (g.phase !== 'horizontal') return;
      if (ev && ev.cancelable) ev.preventDefault();
      if (g.owner === 'row') { g.row.scrollLeft = g.rowStart - g.dx; return; }
      const w = this._track.offsetWidth || 1;
      // Schritt je Karte: Breite plus Abstand (gap) zwischen den Karten.
      const gap = parseFloat(getComputedStyle(this._track).columnGap) || 0;
      const min = -(this._cards.length - 1) * (w + gap);
      let p = -this._index * (w + gap) + g.dx;
      if (p > 0) p *= 0.35;                       // Gummiband am Anfang …
      else if (p < min) p = min + (p - min) * 0.35; // … und am Ende
      this._track.style.transform = `translateX(${p}px)`;
    };
    const end = (cancel) => {
      if (!g) return;
      const was = g;
      g = null;
      this._dragging = false;
      if (was.phase === 'pending') return;              // Tippen: Kachel/Punkt reagiert selbst
      if (was.phase !== 'horizontal') {                 // senkrecht: nach Touch-Scrollen kommt kein Klick
        if (was.kind === 'mouse') this._eatClick(0);
        return;
      }
      this._eatClick(was.kind === 'mouse' ? 0 : 350);
      if (was.owner === 'row') {
        // Schwung in Fingerrichtung weiterlaufen lassen (px je Frame), dann rastet die Reihe ein.
        if (!cancel && Math.abs(was.vx) > 0.05 && performance.now() - was.t < 80) startGlide(was.row, -was.vx * 16);
        else was.row.style.scrollSnapType = '';
        return;
      }
      this._track.style.willChange = '';
      const w = this._track.offsetWidth || 1;
      const flick = Math.abs(was.vx) > 0.35 && Math.sign(was.vx) === Math.sign(was.dx) && performance.now() - was.t < 80;
      const step = !cancel && (Math.abs(was.dx) > w * 0.18 || flick) ? (was.dx < 0 ? 1 : -1) : 0;
      this._goTo(this._index + step, true, false);
      this._startAutoSwipe();
    };

    // Touch: passiver Start, Bewegung nur nach Richtungsentscheid waagerecht verhindert.
    host.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { end(true); return; }
      const t = e.touches[0];
      begin(t.clientX, t.clientY, 'touch');
    }, { passive: true });
    host.addEventListener('touchmove', (e) => {
      if (!g || g.kind !== 'touch' || e.touches.length !== 1) return;
      const t = e.touches[0];
      move(t.clientX, t.clientY, e);
    }, { passive: false });
    host.addEventListener('touchend', () => { if (g && g.kind === 'touch') end(false); }, { passive: true });
    host.addEventListener('touchcancel', () => { if (g && g.kind === 'touch') end(true); }, { passive: true });

    // Maus: Bewegung über window verfolgen (schnelles Ziehen verlässt die Kachel);
    // Pointer-Capture erst nach dem Richtungsentscheid, sonst landet der Klick eines
    // einfachen Tippens auf dem Host statt auf der Kachel.
    const pm = (e) => {
      if (!g || g.kind !== 'mouse' || e.pointerId !== g.pid) return;
      const was = g.phase;
      move(e.clientX, e.clientY, e);
      if (g && was === 'pending' && g.phase === 'horizontal') {
        try { host.setPointerCapture(e.pointerId); } catch (_) { /* schon losgelassen */ }
        host.style.cursor = 'grabbing';
      }
    };
    const pu = (e) => {
      if (!g || g.kind !== 'mouse' || e.pointerId !== g.pid) return;
      window.removeEventListener('pointermove', pm, true);
      window.removeEventListener('pointerup', pu, true);
      window.removeEventListener('pointercancel', pu, true);
      try { if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId); } catch (_) { /* weg */ }
      host.style.cursor = '';
      end(e.type === 'pointercancel');
    };
    host.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const t = e.composedPath()[0];
      if (t && t.closest && t.closest('input, textarea, select, ha-slider, ha-control-slider')) return;
      begin(e.clientX, e.clientY, 'mouse');
      g.pid = e.pointerId;
      window.addEventListener('pointermove', pm, true);
      window.addEventListener('pointerup', pu, true);
      window.addEventListener('pointercancel', pu, true);
    });
    host.addEventListener('dragstart', (e) => e.preventDefault());

    // Mausrad/Trackpad seitwärts: eine Karte je Wischbewegung (Pause > 200 ms beendet sie);
    // der Nachlauf derselben Bewegung wird geschluckt statt weiterzublättern.
    let wh = null;
    host.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const now = performance.now();
      if (!wh || now - wh.t > 200) wh = { owner: null, acc: 0 };
      wh.t = now;
      if (wh.owner === 'row') return;                      // Reihe scrollt nativ
      if (wh.owner === 'done') { e.preventDefault(); return; }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (this.clientWidth || 300) : 1;
      wh.acc += e.deltaX * unit;
      const dir = wh.acc > 0 ? 1 : -1;
      const edge = dir > 0 ? this._index === this._cards.length - 1 : this._index === 0;
      if (edge && this._row()) { wh.owner = 'row'; return; }
      e.preventDefault();
      if (edge || Math.abs(wh.acc) < 40) return;
      this._goTo(this._index + dir, true, false);
      wh.owner = 'done';
      this._startAutoSwipe();
    }, { passive: false });
  }

  getCardSize() { return 3; }
  static getStubConfig() { return { cards: [] }; }
}

customElements.define('casora-swipe-card', CasoraSwipeCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'casora-swipe-card',
  name: 'Casora Swipe Card',
  description: 'Swipeable card stack that fills its container height with no self-measurement — built to work inside casora-smart-row large tiles.',
});
