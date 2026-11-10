// Erzeugt von tools/build-panel-i18n.py – nicht von Hand bearbeiten.
// Quelle: custom_components/casora/translations/panel/*.json
// Übersetzer für das Casora-Panel.
//
// Das Panel (casora-panel.js) schreibt seine Texte auf Englisch. Dieser Teil
// folgt der HA-Sprache des Benutzers und ersetzt sichtbare Texte anhand der
// Tabellen – nur exakte UI-Texte, nie Werte von Eingabefeldern (deren
// Platzhalter, Titel und aria-label schon). Die Originale werden
// gemerkt, damit ein Sprachwechsel ohne Neuladen zurückschalten kann.
//
// Fehlende Texte sammeln: in der Browser-Konsole casoraI18nMissing() aufrufen.
(() => {
  if (window.__casoraPanelI18n) return;
  window.__casoraPanelI18n = true;

  // English ships inline; every other language is panel/i18n/<lang>.json, fetched for the language shown
  // (Ladezeit stage 1: all 8 languages were 1.4 MB / ~500 KB gzip on every Studio start).
  const TABLES = {"en":{"exact":{"Casora":"Casora","Welcome to Casora":"Welcome to Casora","Leave Casora?":"Leave Casora?","every Casora tile is one":"every Casora tile is one","styles Casora's tiles (successor to card-mod)":"styles Casora's tiles (successor to card-mod)","Cards Casora does not manage. They sit below the tiles, exactly as":"Cards Casora does not manage. They sit below the tiles, exactly as","Never yet":"Never","Show blinds":"Show blinds","Adds a Blinds row to the climate popup.":"Adds a Blinds row to the climate popup.","Lamps":"Lamps","Household":"Household","Name or entity":"Name or entity","No device matches the filter.":"No device matches the filter.","The clock needs the Time & Date integration with the option \"Time\".":"The clock needs the Time & Date integration with the option \"Time\".","Add Time & Date":"Add Time & Date"},"patterns":[["^(\\d+) of (\\d+)$","{1} of {2}"],["^Part of (.+)$","Part of {1}"]]}};
  const AVAIL = ["de", "es", "fr", "it", "nl", "pl", "pt"];
  // URL of this module (with the Studio's ?v=), filled in by the build; null when evaluated elsewhere.
  const SELF = import.meta.url;
  const REMEMBER = "casora.i18n.lang";
  const loading = new Map();
  const failed = new Map();
  const ATTRS = ["placeholder", "title", "aria-label", "label", "helper", "heading"];
  const PROPS = ["label", "helper", "heading", "placeholder"];
  const SKIP = new Set(["INPUT", "TEXTAREA", "SCRIPT", "STYLE", "CODE", "PRE"]);

  const orig = new WeakMap();   // Textknoten → Originaltext
  const wrote = new WeakMap();  // Textknoten → was wir zuletzt geschrieben haben
  const attrOrig = new WeakMap(); // Element → {name: original}
  const attrWrote = new WeakMap();
  const missing = new Set();
  let lang = "en";
  let compiled = null;
  // The panel's shadow root, held weakly: HA builds a new panel on every visit, and a strong reference
  // here kept the last one (with its whole preview) alive after leaving the Studio.
  let rootRef = null;
  const curRoot = () => (rootRef && rootRef.deref()) || null;
  let queued = false;
  const dirty = new Set();

  // Which table serves language l (own, else its base language), or null.
  function pick(l) {
    const b = String(l).split("-")[0];
    if (TABLES[l] || AVAIL.includes(l)) return l;
    if (TABLES[b] || AVAIL.includes(b)) return b;
    return null;
  }

  // Fetch a language's table once; resolves when it is there (or could not be loaded).
  function load(w) {
    if (!w || TABLES[w] || !AVAIL.includes(w)) return Promise.resolve();
    if (loading.has(w)) return loading.get(w);
    if (failed.has(w) && Date.now() - failed.get(w) < 30000) return Promise.resolve();
    let url;
    try {
      const v = SELF ? new URL(SELF).searchParams.get("v") : null;
      url = new URL(w + ".json" + (v ? "?v=" + encodeURIComponent(v) : ""), SELF ? new URL("./i18n/", SELF) : new URL("/casora_panel/i18n/", location.href)).href;
    } catch (e) { return Promise.resolve(); }
    const p = fetch(url, { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((t) => {
        TABLES[w] = { exact: (t && t.exact) || {}, patterns: (t && t.patterns) || [] };
        compiled = null;
        memo = null;
        // Translate what is already drawn (the panel rendered untranslated while it loaded).
        const root = curRoot();
        if (root && pick(lang) === w) walk(root);
      })
      .catch((e) => { failed.set(w, Date.now()); console.warn("[casora-panel-i18n] " + w + " not loaded:", e && e.message || e); })
      .finally(() => loading.delete(w));
    loading.set(w, p);
    return p;
  }

  // Start fetching before the panel knows its language: HA's language, else last time's, else the browser's.
  (function prefetch() {
    let g = null;
    try {
      const h = document.querySelector("home-assistant")?.hass;
      g = h && ((h.locale && h.locale.language) || h.language);
    } catch (e) { /* no DOM */ }
    if (!g) { try { g = localStorage.getItem(REMEMBER) || JSON.parse(localStorage.getItem("selectedLanguage") || "null"); } catch (e) { /* private mode */ } }
    if (!g && typeof navigator !== "undefined") g = navigator.language;
    if (g) load(pick(g));
  })();

  function table() {
    if (compiled && compiled.lang === lang) return compiled.t;
    const w = pick(lang);
    // Still loading: untranslated for now (load() walks the panel once it is there).
    if (w && !TABLES[w]) { load(w); return null; }
    const t = (w && TABLES[w]) || null;
    compiled = { lang, t: t && { exact: t.exact, patterns: (t.patterns || []).map(([re, rep]) => [new RegExp(re), rep]) } };
    return compiled.t;
  }

  // Ergebnis je Text für die aktuelle Sprache: dieselben Texte kommen bei jedem Neuzeichnen
  // wieder, die Muster (reguläre Ausdrücke) liefen sonst jedes Mal für jeden Text durch.
  let memo = null;

  // Übersetzung für einen sichtbaren Text, oder null, wenn keine vorliegt.
  function tr(text) {
    const key = text.trim();
    if (!key || !/[A-Za-z]{2}/.test(key)) return null;
    const t = table();
    if (!t) return null;
    if (!memo || memo.lang !== lang || memo.m.size > 5000) memo = { lang, m: new Map() };
    if (memo.m.has(key)) {
      const hit = memo.m.get(key);
      return hit == null ? null : text.replace(key, hit);
    }
    const v = lookup(t, key);
    memo.m.set(key, v);
    return v == null ? null : text.replace(key, v);
  }

  function lookup(t, key) {
    let v = Object.prototype.hasOwnProperty.call(t.exact, key) ? t.exact[key] : null;
    if (v == null) {
      // Muster: {1}, {2} … sind die Gruppen des Ausdrucks; sie werden selbst
      // übersetzt, wenn es dafür einen Eintrag gibt („Expand Climate“ → „Klima aufklappen“).
      for (const [re, rep] of t.patterns) {
        const m = key.match(re);
        if (!m) continue;
        v = rep.replace(/\{(\d+)\}/g, (_, i) => {
          const g = m[+i] || "";
          return Object.prototype.hasOwnProperty.call(t.exact, g) ? t.exact[g] : g;
        });
        break;
      }
    }
    if (v == null) {
      if (lang !== "en" && key.length < 200) missing.add(key);
      return null;
    }
    return v;
  }

  function skipped(node) {
    const root = curRoot();
    for (let p = node.parentNode; p && p !== root; p = p.parentNode) {
      if (p.nodeType !== 1) break;
      if (SKIP.has(p.tagName) || p.isContentEditable || p.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  }

  // skip: schon bekannt (beim Durchgehen vom Elternteil geerbt), sonst selbst nachsehen.
  function doText(n, skip) {
    if (skip === undefined ? skipped(n) : skip) return;
    // Hat das Panel den Text selbst geändert, ist das der neue Originaltext.
    if (!orig.has(n) || n.nodeValue !== wrote.get(n)) orig.set(n, n.nodeValue);
    const o = orig.get(n);
    const want = tr(o) ?? o;
    wrote.set(n, want);
    if (n.nodeValue !== want) n.nodeValue = want;
  }

  function doAttrs(el) {
    let o = attrOrig.get(el);
    let w = attrWrote.get(el);
    if (!o) { o = {}; w = {}; attrOrig.set(el, o); attrWrote.set(el, w); }
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      if (!(a in o) || cur !== w[a]) o[a] = cur;
      const want = tr(o[a]) ?? o[a];
      w[a] = want;
      if (cur !== want) el.setAttribute(a, want);
    }
    // HA-Komponenten (ha-textfield, ha-select …) bekommen Beschriftungen als Eigenschaft.
    if (el.tagName.includes("-")) {
      for (const p of PROPS) {
        const cur = el[p];
        if (typeof cur !== "string" || !cur) continue;
        const k = "prop:" + p;
        if (!(k in o) || cur !== w[k]) o[k] = cur;
        const want = tr(o[k]) ?? o[k];
        w[k] = want;
        if (cur !== want) el[p] = want;
      }
    }
  }

  // skip: Texte darunter nicht übersetzen – für den Startknoten einmal über die Vorfahren
  // ermittelt und dann vererbt (vorher lief jeder Textknoten selbst bis zur Wurzel hoch).
  function walk(node, skip) {
    if (!node) return;
    if (node.nodeType === 3) { doText(node, skip); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      // Eingabefelder: nie den Wert, aber Platzhalter/Titel/aria-label schon.
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
        if (!node.hasAttribute("data-no-i18n")) doAttrs(node);
        return;
      }
      if (SKIP.has(node.tagName) && node.tagName !== "PRE") return;
      doAttrs(node);
    }
    let s = skip === undefined ? (node.nodeType === 1 && skipped(node)) : skip;
    if (!s && node.nodeType === 1) s = SKIP.has(node.tagName) || node.isContentEditable || node.hasAttribute("data-no-i18n");
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c, s);
  }

  function flush() {
    queued = false;
    const nodes = [...dirty];
    dirty.clear();
    nodes.forEach((n) => walk(n));
  }

  // Gleich nach dem Einfügen übersetzen (Mikrotask), nicht erst im nächsten Frame:
  // Rendert das Panel selbst in einem requestAnimationFrame, käme ein Frame-Rückruf von
  // hier erst einen Frame später – dazwischen stünde kurz der englische Text.
  function queue(n) {
    dirty.add(n);
    if (!queued) { queued = true; queueMicrotask(flush); }
  }

  function attach(sr) {
    if (!sr || sr.__casoraI18n) return;
    sr.__casoraI18n = true;
    rootRef = new WeakRef(sr);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList") m.addedNodes.forEach(queue);
        else if (m.type === "characterData") queue(m.target);
        else if (m.type === "attributes") queue(m.target);
      }
    }).observe(sr, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(sr);
  }

  customElements.whenDefined("casora-panel").then(() => {
    const C = customElements.get("casora-panel");
    const desc = Object.getOwnPropertyDescriptor(C.prototype, "hass");
    if (!desc || !desc.set || C.prototype.__casoraI18nHooked) return;
    C.prototype.__casoraI18nHooked = true;
    Object.defineProperty(C.prototype, "hass", {
      configurable: true,
      get: desc.get,
      set(h) {
        desc.set.call(this, h);
        const next = (h && ((h.locale && h.locale.language) || h.language)) || "en";
        if (next !== lang) {
          lang = next;
          try { if (h && localStorage.getItem(REMEMBER) !== next) localStorage.setItem(REMEMBER, next); } catch (e) { /* private mode */ }
          const w = pick(next);
          // The language's table is not here yet: keep the panel hidden until it is (at most 3 s), so it
          // does not show English first and then switch.
          if (w && !TABLES[w] && !this.__casoraI18nHeld) {
            this.__casoraI18nHeld = true;
            this.style.visibility = "hidden";
            const show = () => { if (this.__casoraI18nHeld) { this.__casoraI18nHeld = false; this.style.visibility = ""; } };
            const t = setTimeout(show, 3000);
            load(w).then(() => { clearTimeout(t); show(); });
          }
          attach(this.shadowRoot);
          if (this.shadowRoot) walk(this.shadowRoot);
        } else attach(this.shadowRoot);
      },
    });
  });

  window.casoraI18nMissing = () => [...missing].sort();
  // Für Casora-Erweiterungen: einzelnen Text in der aktuellen Sprache (sonst unverändert).
  window.casoraI18n = { t: (s) => (s && tr(String(s))) || s };
})();
