// Studio → „Updates“ (30.09.2026)
//
// Eigener Abschnitt „Casora“ ganz unten in der Seitenleiste. Die Seite zeigt die
// installierte Version, ob es eine neue gibt (installieren, nach Updates suchen,
// danach Neustart) und alle Versionen mit ihren Versionshinweisen. Einen Zugang braucht
// es nicht (öffentliches Repo); verwaltet HACS Casora, meldet HACS neue Versionen.
// Daten: casora/updates/list (updates.py); Installieren und Prüfen über HAs eigene
// Dienste an der Update-Entität (update.py). Kein Zurückspielen älterer Versionen.
// Die Liste ist nach „kind“ gruppiert – später können Karten-Updates dazukommen.
(function () {
  const ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.1" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/>'
    + '<path d="M20 4.5V9h-4.5"/><path d="M12 8v7M9 12.5l3 3 3-3"/></svg>');
  // Icon-Farbe aus der zentralen Tabelle des Panels (STUDIO_ICON, casora-panel.js).
  const tint = () => ((window.__casoraPanelInternals || {}).studioIcon ? window.__casoraPanelInternals.studioIcon("updates") : "var(--casora-color-blue, #0A84FF)");
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" '
    + 'stroke-linejoin="round"><path d="m9.5 6 6 6-6 6"/></svg>';

  const CSS = ".cu-wrap{padding:4px 0 28px}"
    + ".cu-blurb{margin:0 4px 16px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".cu-h{margin:22px 6px 8px;font-size:var(--t-foot);font-weight:600;letter-spacing:.01em;color:var(--ink-2)}"
    + ".cu-box{border-radius:var(--r-l);overflow:hidden;background:var(--casora-popup-row-fill,rgba(255,255,255,.07))}"
    // Kopf: installierte Version, Status, Knöpfe
    + ".cu-hero{padding:16px 16px 14px}"
    + ".cu-top{display:flex;align-items:center;gap:14px}"
    + ".cu-logo{flex:0 0 44px;height:44px;border-radius:var(--r-m);background:var(--casora-studio-icon-info, linear-gradient(to bottom,#2fd6e0,#0a84ff));position:relative}"
    + ".cu-logo::after{content:'';position:absolute;inset:10px;background:#fff;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat}"
    + ".cu-tx{flex:1 1 auto;min-width:0}"
    + ".cu-tx small{display:block;font-size:var(--t-foot);color:var(--ink-2)}"
    + ".cu-tx b{display:block;font-size:var(--t-title);font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}"
    + ".cu-state{display:flex;align-items:center;gap:8px;margin:14px 0 0;font-size:var(--t-callout);font-weight:600;color:var(--ink)}"
    + ".cu-state i{flex:none;width:9px;height:9px;border-radius:50%;background:var(--casora-studio-good, #34c759);box-shadow:0 0 0 4px var(--casora-studio-good-tint, rgba(52,199,89,.22))}"
    + ".cu-state.new i{background:var(--casora-studio-done, #0a84ff);box-shadow:0 0 0 4px var(--casora-studio-link-tint, rgba(10,132,255,.25))}"
    + ".cu-state.wait i{background:var(--casora-studio-warn, #ff9f0a);box-shadow:0 0 0 4px var(--casora-studio-warn-tint, rgba(255,159,10,.25))}"
    + ".cu-state.off i{background:var(--casora-studio-fold-ink, rgba(235,235,245,.35));box-shadow:none}"
    + ".cu-sum{margin:5px 0 0 17px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".cu-acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}"
    + ".cu-acts button{padding:8px 14px;font-size:var(--t-foot)}"
    + ".cu-when{flex:1 1 100%;font-size:var(--t-caption);color:var(--ink-3,rgba(235,235,245,.5))}"
    + ".cu-bar{position:relative;height:4px;margin-top:14px;border-radius:2px;overflow:hidden;background:rgba(255,255,255,.1)}"
    + ".cu-bar::after{content:'';position:absolute;top:0;bottom:0;width:36%;border-radius:2px;background:var(--casora-studio-done, #0a84ff);animation:cuRun 1.2s cubic-bezier(.4,0,.2,1) infinite}"
    + "@keyframes cuRun{from{left:-36%}to{left:100%}}"
    + ".cu-err{margin:12px 0 0;font-size:var(--t-foot);line-height:1.4;color:var(--casora-studio-bad, #ff6961)}"
    + ".cu-note{margin:12px 0 0;padding:10px 12px;border-radius:var(--r-m);font-size:var(--t-foot);line-height:1.45;background:var(--casora-studio-warn-tint, rgba(255,159,10,.14));color:var(--ink)}"
    // Alle Versionen
    + ".cu-row{appearance:none;display:flex;align-items:center;gap:10px;width:100%;min-height:50px;margin:0;padding:9px 14px;"
    + "border:0;border-radius:0;background:none;box-shadow:none;color:inherit;text-align:left;cursor:pointer;font:inherit}"
    + ".cu-item+.cu-item{box-shadow:inset 0 .5px 0 var(--hair,rgba(255,255,255,.1))}"
    + ".cu-row:hover{background:rgba(255,255,255,.05);filter:none}.cu-row:active{transform:none}"
    + ".cu-row svg{flex:0 0 14px;width:14px;height:14px;color:var(--ink-3,rgba(235,235,245,.5));transition:transform .22s cubic-bezier(.32,.72,0,1)}"
    + ".cu-row[aria-expanded=true] svg{transform:rotate(90deg)}"
    + ".cu-v{flex:none;font-size:var(--t-callout);font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}"
    + ".cu-d{flex:1 1 auto;min-width:0;font-size:var(--t-foot);color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".cu-tags{flex:none;display:flex;gap:6px}"
    + ".cu-tag{padding:3px 8px;border-radius:999px;font-size:var(--t-caption);font-weight:600;letter-spacing:.02em;white-space:nowrap}"
    + ".cu-tag.new{background:var(--casora-studio-link-tint, rgba(10,132,255,.22));color:var(--casora-studio-link, #4aa3ff)}"
    + ".cu-tag.inst{background:var(--casora-studio-good-tint, rgba(52,199,89,.2));color:var(--casora-studio-good, #34c759)}"
    + ".cu-tag.wait{background:var(--casora-studio-warn-tint, rgba(255,159,10,.2));color:var(--casora-studio-warn, #ff9f0a)}"
    + ".cu-tag.pre{background:rgba(255,255,255,.1);color:var(--ink-2)}"
    + ".cu-body{padding:0 16px 14px 38px;font-size:var(--t-foot);line-height:1.5;color:var(--ink)}"
    + ".cu-body[hidden]{display:none}"
    + ".cu-meta{margin:0 0 6px;font-size:var(--t-caption);color:var(--ink-2)}"
    + ".cu-notes h3,.cu-notes h4,.cu-notes h5,.cu-notes h6{margin:12px 0 4px;font-size:var(--t-caption);font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}"
    + ".cu-notes h4:first-child,.cu-notes h5:first-child,.cu-notes h6:first-child{margin-top:4px}"
    + ".cu-notes ul,.cu-notes ol{margin:0;padding-left:18px}.cu-notes li{margin:3px 0}"
    + ".cu-new{margin:4px 0 6px}.cu-new h4{margin:2px 0 12px;font-size:var(--t-title);font-weight:700;letter-spacing:-.01em;color:var(--ink)}"
    + ".cu-new-it{margin:0 0 12px}.cu-new-it b{display:block;font-size:var(--t-callout);font-weight:600;color:var(--ink)}"
    + ".cu-new-it span{display:block;font-size:var(--t-callout);line-height:1.45;color:var(--ink-2)}"
    + ".cu-more{appearance:none;border:0;background:none;padding:2px 0 10px;font:inherit;font-size:var(--t-callout);color:var(--casora-studio-link, #4aa3ff);cursor:pointer}"
    + ":host(.is-light) .cu-more{color:var(--casora-studio-link, #0a6fd8)}"
    + ".cu-notes li::marker{color:var(--ink-3,rgba(235,235,245,.5))}"
    + ".cu-notes p{margin:6px 0}.cu-notes strong{font-weight:600}"
    + ".cu-notes code{padding:1px 5px;border-radius:var(--r-s);font-size:var(--t-foot);background:rgba(255,255,255,.1)}"
    + ".cu-notes pre{overflow:auto;padding:8px 10px;border-radius:var(--r-s);background:rgba(0,0,0,.25)}"
    + ".cu-notes a,.cu-link{color:var(--casora-studio-link, #4aa3ff);text-decoration:none}.cu-notes a:hover,.cu-link:hover{text-decoration:underline}"
    + ".cu-empty{padding:22px 16px;text-align:center;font-size:var(--t-foot);color:var(--ink-2)}"
    + ".cu-link{display:inline-block;margin-top:8px;font-size:var(--t-foot)}"
    // Karten-Updates
    + ".cu-cardtop{padding-bottom:12px}"
    + ".cu-auto{box-shadow:inset 0 .5px 0 var(--hair,rgba(255,255,255,.1))}.cu-auto .sw{flex:none}"
    + ".cu-box>.cu-item,.cu-auto+.cu-item{box-shadow:inset 0 .5px 0 var(--hair,rgba(255,255,255,.1))}"
    + ".cu-cards{list-style:none;margin:8px 0 0;padding:0}"
    + ".cu-cards li{padding:8px 0}.cu-cards li+li{box-shadow:inset 0 .5px 0 var(--hair,rgba(255,255,255,.1))}"
    + ".cu-cardhead{display:flex;align-items:center;gap:8px}.cu-cardhead b{flex:1 1 auto;font-weight:600}"
    + ".cu-cardnote{margin-top:2px;font-size:var(--t-foot);color:var(--ink-2)}"
    + ".cu-reason{margin:0 0 8px}"
    // Schalterzeile (Karten-Updates: automatisch übernehmen)
    + ".cu-kv{display:flex;align-items:center;gap:12px;min-height:46px;padding:8px 16px;font-size:var(--t-callout)}"
    + ".cu-kv span{flex:1 1 auto;color:var(--ink)}"
    // Beta-Versionen: Schalter mit kurzer Erklärung unter dem Kopf
    + ".cu-beta{margin-top:12px}.cu-beta .cu-kv{padding:11px 16px}.cu-beta .sw{flex:none}"
    + ".cu-kv .cu-kvtx{display:block;flex:1 1 auto;min-width:0}"
    + ".cu-kvtx b{display:block;font-weight:400;color:var(--ink)}"
    + ".cu-kvtx small{display:block;margin-top:2px;font-size:var(--t-foot);line-height:1.4;color:var(--ink-2)}"
    // Seitenleiste: Punkt/Zahl bei neuer Version
    + ".sidelist .siderow .cu-badge{flex:none;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:999px;"
    + "background:var(--casora-studio-done, #0a84ff);color:#fff;font-size:var(--t-caption);font-weight:700;line-height:18px;text-align:center}"
    + ":host(.is-light) .cu-box{background:var(--casora-popup-row-fill,rgba(0,0,0,.04))}"
    + ":host(.is-light) .cu-row:hover{background:rgba(0,0,0,.04)}"
    + ":host(.is-light) .cu-tag.pre{background:var(--casora-studio-chip, rgba(118,118,128,.12))}"
    + ":host(.is-light) .cu-tag.new{color:var(--casora-studio-link, #0a6fd8)}:host(.is-light) .cu-tag.inst{color:var(--casora-studio-good, #1f9d45)}:host(.is-light) .cu-tag.wait{color:var(--casora-studio-warn, #c76f00)}"
    + ":host(.is-light) .cu-notes a,:host(.is-light) .cu-link{color:var(--casora-studio-link, #0a6fd8)}"
    + ":host(.is-light) .cu-bar{background:rgba(0,0,0,.08)}:host(.is-light) .cu-notes code{background:rgba(0,0,0,.06)}";

  const t = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Versionen mit Vorabversions-Zusatz wie release_notes.compare_versions:
  // 1.1.0 > 1.1.0-beta.2 > 1.1.0-beta.1 > 1.0.3.
  const ver = (v) => (String(v || "").match(/\d+/g) || ["0"]).slice(0, 3).map(Number);
  const pre = (v) => { const m = /^\D*\d+(?:\.\d+){0,2}-([0-9A-Za-z.-]+)/.exec(String(v || "")); return m ? m[1] : ""; };
  const cmp = (a, b) => {
    const x = ver(a), y = ver(b);
    for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    const pa = pre(a), pb = pre(b);
    if (pa === pb) return 0;
    if (!pa || !pb) return pa ? -1 : 1;
    const sa = pa.split("."), sb = pb.split(".");
    for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
      if (sa[i] === sb[i]) continue;
      const na = /^\d+$/.test(sa[i]), nb = /^\d+$/.test(sb[i]);
      if (na && nb) return Number(sa[i]) - Number(sb[i]);
      if (na !== nb) return na ? -1 : 1;
      return sa[i] < sb[i] ? -1 : 1;
    }
    return sa.length - sb.length;
  };

  // Die Hinweise kommen schon sicher gerendert (release_notes.py). Trotzdem nur die
  // bekannten Auszeichnungen zulassen – was sonst ankäme, wird zu Text.
  const OK_TAGS = new Set(["H3", "H4", "H5", "H6", "P", "UL", "OL", "LI", "STRONG", "EM", "CODE", "PRE", "A", "HR", "BR"]);
  function safeNotes(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html || "");
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 1) {
          if (!OK_TAGS.has(n.tagName)) { n.replaceWith(document.createTextNode(n.textContent || "")); return; }
          [...n.attributes].forEach((a) => {
            const keep = n.tagName === "A" && (a.name === "href" ? /^https?:\/\//i.test(a.value) : a.name === "target" || a.name === "rel");
            if (!keep) n.removeAttribute(a.name);
          });
          if (n.tagName === "A") { n.target = "_blank"; n.rel = "noopener noreferrer"; }
          walk(n);
        } else if (n.nodeType !== 3) n.remove();
      });
    };
    walk(tpl.content);
    return tpl.content;
  }

  // Markdown → HTML für Texte, die nur als Markdown kommen (Karten-Updates). Wie
  // release_notes.py: erst escapen, dann nur Überschriften, Listen, fett/kursiv, Code
  // und https-Links – danach geht es trotzdem noch durch safeNotes.
  const emph = (s) => s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g, "$1<em>$2</em>");
  function inline(text) {
    const keep = [];
    const hold = (h) => "\u0000" + (keep.push(h) - 1) + "\u0000";
    let s = String(text).replace(/\u0000/g, "");
    s = s.replace(/`([^`]+)`/g, (m, c) => hold("<code>" + esc(c) + "</code>"));
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, url) => (/^https?:\/\/[^\s<>]+$/i.test(url)
      ? hold('<a href="' + esc(url) + '">' + emph(esc(label)) + "</a>") : m));
    return emph(esc(s)).replace(/\u0000(\d+)\u0000/g, (m, i) => keep[Number(i)]);
  }
  function mdHtml(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    const stack = [];  // offene Listen: {indent, tag}
    let para = [], item = null;
    const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    const flushItem = () => { if (item) { out.push(inline(item.join(" "))); item = null; } };
    const closeLists = () => { flushItem(); while (stack.length) out.push("</li></" + stack.pop().tag + ">"); };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], s = line.trim();
      if (s.startsWith("```")) {
        flushPara(); closeLists();
        const code = [];
        for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
        continue;
      }
      if (!s) { flushPara(); flushItem(); continue; }
      const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(s);
      if (h) { flushPara(); closeLists(); const n = Math.min(6, h[1].length + 2); out.push("<h" + n + ">" + inline(h[2]) + "</h" + n + ">"); continue; }
      const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (li) {
        flushPara(); flushItem();
        const indent = li[1].replace(/\t/g, "    ").length, tag = /\d/.test(li[2]) ? "ol" : "ul";
        const top = stack[stack.length - 1];
        if (top && indent > top.indent && stack.length < 3) { out.push("<" + tag + "><li>"); stack.push({ indent, tag }); }
        else {
          while (stack.length && indent < stack[stack.length - 1].indent) out.push("</li></" + stack.pop().tag + ">");
          const cur = stack[stack.length - 1];
          if (cur && cur.tag === tag) out.push("</li><li>");
          else { if (cur) out.push("</li></" + stack.pop().tag + ">"); out.push("<" + tag + "><li>"); stack.push({ indent, tag }); }
        }
        item = [li[3].trim()];
        continue;
      }
      if (stack.length && (item || /^\s/.test(line))) { (item = item || []).push(s); continue; }
      closeLists();
      para.push(s);
    }
    flushPara(); closeLists();
    return out.join("");
  }
  if (typeof window !== "undefined") window.casoraMarkdown = mdHtml;

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraUpdates) return;
    P.__casoraUpdates = true;

    const lang = (self) => String((self._hass && self._hass.locale && self._hass.locale.language)
      || (self._hass && self._hass.language) || navigator.language || "en");
    // Sprache der Versionshinweise: Deutsch nur für Deutsch, sonst Englisch (release_notes.notes_lang).
    const notesLang = (self) => (lang(self).toLowerCase().split(/[-_]/)[0] === "de" ? "de" : "en");
    const fmtDate = (self, iso, short) => {
      if (!iso) return "";
      const d = new Date(/T/.test(iso) ? iso : iso + "T12:00:00");
      return isNaN(d) ? "" : d.toLocaleDateString(lang(self), { day: "numeric", month: short ? "short" : "long", year: "numeric" });
    };
    const ago = (self, iso) => {
      const d = iso ? new Date(iso) : null;
      if (!d || isNaN(d)) return "";
      // Uhr des Browsers etwas vor HA: nie „in 2 Minuten“.
      const s = Math.min(0, Math.round((d - Date.now()) / 1000));
      const rtf = new Intl.RelativeTimeFormat(lang(self), { numeric: "auto" });
      if (Math.abs(s) < 60) return rtf.format(0, "second");
      if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), "minute");
      if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), "hour");
      return rtf.format(Math.round(s / 86400), "day");
    };

    const css = (self) => {
      if (self.shadowRoot.getElementById("casora-updates-css")) return;
      const st = document.createElement("style");
      st.id = "casora-updates-css";
      st.textContent = CSS;
      self.shadowRoot.appendChild(st);
    };

    // Die Update-Entität der Integration, auch bevor die Seite einmal geladen hat.
    const entityOf = (self) => {
      const h = self._hass;
      if (!h) return null;
      if (self._cuData && self._cuData.entity_id) return self._cuData.entity_id;
      const ents = h.entities || {};
      return Object.keys(ents).find((id) => id.startsWith("update.") && ents[id] && ents[id].platform === "casora") || null;
    };
    const available = (self) => {
      const id = entityOf(self);
      const st = id && self._hass && self._hass.states[id];
      if (st) return st.state === "on";
      return !!(self._cuData && self._cuData.update_available);
    };

    // ── Daten ────────────────────────────────────────────────────────────────
    P._cuLoad = async function (force) {
      try {
        // Versionshinweise in der Sprache des Panels (Deutsch, sonst Englisch; updates.py).
        this._cuData = await this._hass.callWS({ type: "casora/updates/list", force: !!force, language: lang(this) });
        this._cuLoadErr = null;
      } catch (e) {
        this._cuLoadErr = e && e.message ? e.message : String(e);
      }
      return this._cuData;
    };

    // Karten-Updates (card_updates.py). Ältere Integration ohne den Befehl: Gruppe fehlt.
    P._cuLoadCards = async function (refresh) {
      try {
        this._cuCards = await this._hass.callWS({ type: "casora/card_updates/list", refresh: !!refresh });
        this._cuCardsErr = null;
      } catch (e) {
        if (e && e.code === "unknown_command") this._cuCards = null;
        else this._cuCardsErr = e && e.message ? e.message : String(e);
      }
      return this._cuCards;
    };
    const cardsOpen = (self) => ((self._cuCards && self._cuCards.available) || []).filter((p) => p.applicable).length;

    P._cuRepaint = function () {
      if (this._cuWrap && this._cuWrap.isConnected) this._cuFill(this._cuWrap);
      this._cuBadge();
    };

    P._cuCheck = async function () {
      const d = this._cuData || {};
      if (!d.entity_id || this._cuBusy) return;
      this._cuBusy = "check";
      this._cuErr = null;
      this._cuRepaint();
      try {
        await this._hass.callService("homeassistant", "update_entity", { entity_id: d.entity_id });
      } catch (e) {
        this._cuErr = t("Checking didn't work.") + " " + (e.message || e);
      }
      await this._cuLoad(true);
      this._cuBusy = null;
      this._cuRepaint();
    };

    P._cuInstall = async function () {
      const d = this._cuData || {};
      if (!d.entity_id || this._cuBusy) return;
      const ok = await this._ask({
        title: t("Install Casora {v}?").replace("{v}", String(d.latest)),
        message: t("The running version is backed up to casora_sicherungen first. Home Assistant needs a restart afterwards."),
        confirmLabel: t("Install"),
      });
      if (!ok) return;
      this._cuBusy = "install";
      this._cuErr = null;
      this._cuRepaint();
      try {
        await this._hass.callService("update", "install", { entity_id: d.entity_id });
      } catch (e) {
        this._cuErr = t("Installing didn't work.") + " " + (e.message || e);
      }
      await this._cuLoad(false);
      this._cuBusy = null;
      this._cuRepaint();
    };

    P._cuRestart = async function () {
      const dirty = this._state && this._isDirty && this._isDirty();
      const ok = await this._ask({
        title: t("Restart Home Assistant now?"),
        message: t("Home Assistant is unavailable for a moment while it restarts.")
          + (dirty ? " " + t("Your unsaved changes in the Studio will be lost.") : ""),
        confirmLabel: t("Restart"), destructive: true,
      });
      if (!ok) return;
      try {
        await this._hass.callService("homeassistant", "restart", {});
      } catch (e) {
        // Der Neustart trennt die Verbindung (Code 3) – das ist kein Fehler.
        if (e && (e.code === 3 || !e.message)) return;
        this._cuErr = t("The restart didn't work.") + " " + (e.message || e);
        this._cuRepaint();
      }
    };

    // ── Inhalt (Seite am Desktop und Blatt am Handy) ─────────────────────────
    const ERR = {
      forbidden: "No access to Casora's updates.",
      rate_limited: "Too many requests for now. Casora tries again later.",
      unreachable: "GitHub can't be reached right now. The list shows the notes that came with Casora.",
    };
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const btn = (label, onTap, ghost) => {
      const b = el("button", ghost ? "ghost" : "", label);
      b.type = "button";
      b.onclick = onTap;
      return b;
    };

    P._cuFill = function (wrap) {
      css(this);
      this._cuWrap = wrap;
      const d = this._cuData;
      wrap.replaceChildren();
      wrap.setAttribute("data-no-i18n", "");
      if (!d) {
        const box = el("div", "cu-box cu-empty", this._cuLoadErr
          ? t("Updates could not be loaded.") + " " + this._cuLoadErr : t("Loading updates…"));
        wrap.appendChild(box);
        return;
      }
      const group = (d.groups || []).find((g) => g.kind === "casora") || { releases: [] };
      const rels = group.releases || [];
      const latestRel = rels.find((r) => r.version === d.latest);
      const st = d.entity_id && this._hass && this._hass.states[d.entity_id];
      const busy = this._cuBusy || (st && st.attributes && st.attributes.in_progress ? "install" : null);

      // Kopf
      const hero = el("div", "cu-box cu-hero");
      const top = el("div", "cu-top");
      const logo = el("span", "cu-logo");
      logo.style.setProperty("--i", "url('" + ICON + "')");
      const tx = el("div", "cu-tx");
      tx.append(el("small", "", t("Installed")), el("b", "", String(d.installed)));
      top.append(logo, tx);
      hero.appendChild(top);

      const state = el("div", "cu-state");
      state.appendChild(el("i"));
      const stTx = el("span");
      state.appendChild(stTx);
      hero.appendChild(state);
      const acts = el("div", "cu-acts");
      if (d.pending_restart) {
        state.classList.add("wait");
        stTx.textContent = t("v{v} is installed – restart needed").replace("{v}", d.pending_restart);
        hero.appendChild(el("div", "cu-sum", t("Casora {v} keeps running until Home Assistant restarts.").replace("{v}", String(d.installed))));
        acts.appendChild(btn(t("Restart Now"), () => this._cuRestart()));
      } else if (busy === "install") {
        state.classList.add("new");
        stTx.textContent = t("Installing v{v}…").replace("{v}", d.latest);
        hero.appendChild(el("div", "cu-bar"));
      } else if (d.update_available) {
        state.classList.add("new");
        const when = latestRel && latestRel.date ? " (" + fmtDate(this, latestRel.date) + ")" : "";
        stTx.textContent = t("New: v{v}").replace("{v}", d.latest) + when;
        if (latestRel && latestRel.summary) hero.appendChild(el("div", "cu-sum", latestRel.summary));
        const inst = btn(t("Install"), () => this._cuInstall());
        inst.disabled = !d.entity_id || !!busy;
        acts.appendChild(inst);
      } else if (d.hacs) {
        // Mit HACS keine eigene Update-Entität – HACS meldet neue Versionen.
        stTx.textContent = t("Updates via HACS");
        hero.appendChild(el("div", "cu-sum", t("HACS offers new Casora versions under Settings → Updates.")));
      } else {
        stTx.textContent = t("Current");
      }
      if (d.token && !d.pending_restart && busy !== "install") {
        const chk = btn(busy === "check" ? t("Checking…") : t("Check for Updates"), () => this._cuCheck(), true);
        chk.disabled = !d.entity_id || !!busy;
        acts.appendChild(chk);
      }
      if (d.token) {
        acts.appendChild(el("div", "cu-when", d.last_check
          ? t("Last checked {when}").replace("{when}", ago(this, d.last_check)) : t("Not checked yet")));
      }
      if (acts.children.length) hero.appendChild(acts);
      if (d.pending_restart) {
        hero.appendChild(el("div", "cu-note", t("The previous version is kept in casora_sicherungen. Home Assistant also lists the restart under Repairs.")));
      }
      const errTx = this._cuErr || (d.last_error && t(ERR[d.last_error] || ERR.unreachable));
      if (errTx) hero.appendChild(el("div", "cu-err", errTx));
      wrap.appendChild(hero);
      wrap.appendChild(this._cuBetaBox(d));

      // Alle Versionen
      wrap.appendChild(el("div", "cu-h", t("All Versions")));
      const list = el("div", "cu-box");
      if (!this._cuOpenRows) this._cuOpenRows = new Set(rels.length ? [rels[0].version] : []);
      if (!rels.length) list.appendChild(el("div", "cu-empty", t("No versions known yet.")));
      rels.forEach((r) => {
        const item = el("div", "cu-item");
        const row = el("button", "cu-row");
        row.type = "button";
        const open = this._cuOpenRows.has(r.version);
        row.setAttribute("aria-expanded", open ? "true" : "false");
        row.insertAdjacentHTML("beforeend", CHEV);
        row.append(el("span", "cu-v", String(r.version).replace(/^v/, "")), el("span", "cu-d", fmtDate(this, r.date, true)));
        const tags = el("span", "cu-tags");
        const isInst = cmp(r.version, d.installed) === 0 && r.version.replace(/^v/, "") === String(d.installed);
        if (d.pending_restart && r.version === d.pending_restart) tags.appendChild(el("span", "cu-tag wait", t("Restart needed")));
        else if (isInst) tags.appendChild(el("span", "cu-tag inst", t("Installed")));
        else if (cmp(r.version, d.installed) > 0 && (!r.prerelease || d.beta)) tags.appendChild(el("span", "cu-tag new", t("NEW")));
        if (r.prerelease || pre(r.version)) tags.appendChild(el("span", "cu-tag pre", t("Beta")));
        row.appendChild(tags);
        const body = el("div", "cu-body");
        body.hidden = !open;
        if (r.installed_at) {
          body.appendChild(el("div", "cu-meta", t("Installed on {date}").replace("{date}", fmtDate(this, r.installed_at))));
        }
        const notes = el("div", "cu-notes");
        if (r.notes_html) notes.appendChild(safeNotes(r.notes_html));
        else notes.appendChild(el("p", "", t("No release notes.")));
        // Die installierte Version erzählt zuerst in Klartext, was neu ist (wie das Neu-Fenster);
        // die technischen Hinweise liegen dahinter.
        const news = isInst && typeof window.casoraWhatsNew === "function" ? window.casoraWhatsNew(this._hass && this._hass.language) : null;
        if (news && news.version === String(r.version).replace(/^v/, "") && news.items.length) {
          const nw = el("div", "cu-new");
          nw.appendChild(el("h4", "", news.title));
          news.items.forEach(([title, text]) => {
            const it = el("div", "cu-new-it");
            it.append(el("b", "", title), el("span", "", text));
            nw.appendChild(it);
          });
          const more = el("button", "cu-more", t("Show all changes"));
          more.type = "button";
          notes.hidden = true;
          more.onclick = () => { notes.hidden = !notes.hidden; more.textContent = t(notes.hidden ? "Show all changes" : "Hide all changes"); };
          body.append(nw, more);
        }
        body.appendChild(notes);
        if (r.url && /^https:\/\//.test(r.url)) {
          const a = el("a", "cu-link", t("View on GitHub"));
          a.href = r.url; a.target = "_blank"; a.rel = "noopener noreferrer";
          body.appendChild(a);
        }
        row.onclick = () => {
          const now = !this._cuOpenRows.has(r.version);
          if (now) this._cuOpenRows.add(r.version); else this._cuOpenRows.delete(r.version);
          row.setAttribute("aria-expanded", now ? "true" : "false");
          body.hidden = !now;
        };
        item.append(row, body);
        list.appendChild(item);
      });
      wrap.appendChild(list);

      this._cuFillCards(wrap);
    };

    // ── Beta-Versionen (Option beta_updates, options.py) ─────────────────────
    // An: Vorabversionen (GitHub-Prerelease, etwa v1.1.0-beta.1) gelten als Update.
    // Mit HACS gibt es keine eigene Update-Entität: dann nur der Hinweis auf HACS.
    P._cuBetaBox = function (d) {
      const box = el("div", "cu-box cu-beta");
      const row = el("div", "cu-kv");
      const tx = el("span", "cu-kvtx");
      tx.append(el("b", "", t("Beta versions")), el("small", "", d.hacs
        ? t("Casora is updated through HACS. Turn on betas there: Show beta versions on the Casora entry.")
        : t("Try new features earlier. Betas can have bugs.")));
      row.appendChild(tx);
      if (!d.hacs && this._boolSwitch) {
        const sw = this._boolSwitch(!!d.beta, false, (v) => this._cuBeta(!!v), t("Beta versions"));
        sw.disabled = this._cuBusy === "beta";
        row.appendChild(sw);
      }
      box.appendChild(row);
      return box;
    };

    P._cuBeta = async function (on) {
      const d = this._cuData;
      if (!d || this._cuBusy) return;
      const was = !!d.beta;
      d.beta = on;
      this._cuBusy = "beta";
      this._cuErr = null;
      this._cuRepaint();
      try {
        const cur = await this._hass.callWS({ type: "casora/options/get" });
        await this._hass.callWS({ type: "casora/options/set", options: { ...(cur.options || {}), beta_updates: on } });
        // Die Integration lädt neu (Update-Listener) und prüft dabei gleich wieder.
        await new Promise((r) => setTimeout(r, 2500));
        await this._cuLoad(true);
      } catch (e) {
        d.beta = was;
        this._cuErr = t("Saving didn't work.") + " " + ((e && e.message) || e);
      }
      this._cuBusy = null;
      this._cuRepaint();
    };

    // ── Karten-Updates: Fehlerbehebungen für Kacheln ohne Casora-Release ─────
    const STATE = { neu: ["New", "new"], aktuell: ["Already current", "inst"], veraltet: ["Not for this version", "pre"],
      ersetzt: ["Replaced by a later update", "pre"], ungueltig: ["Invalid", "wait"] };
    // casora_waschmaschine → „Waschmaschine“ (Kacheltyp des Studios), sonst lesbar gemacht.
    const cardName = (name) => {
      const types = (window.__casoraPanelInternals && window.__casoraPanelInternals.TILE_TYPES) || [];
      const all = types.concat(window.CASORA_TILE_TYPES || []);
      const hit = all.find((x) => x && x.template === name)
        || all.find((x) => x && x.template && name.replace(/_popup/, "") === x.template);
      if (hit && hit.label) return t(hit.label) + (/_popup/.test(name) && !/_popup/.test(hit.template) ? " – " + t("Popup") : "");
      const raw = String(name || "").replace(/^(casora|hemma)_/, "").replace(/_/g, " ").trim();
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : String(name || "");
    };

    P._cuApplyCards = async function (pkg) {
      if (this._cuBusy) return;
      this._cuBusy = "cards";
      this._cuCardErr = null;
      this._cuRepaint();
      try {
        const r = await this._hass.callWS({ type: "casora/card_updates/apply", id: pkg.id });
        const n = (r && r.dashboards) || 0;
        const msg = n === 1 ? t("1 dashboard updated") : t("{n} dashboards updated").replace("{n}", n);
        this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: msg, duration: 6000 }, bubbles: true, composed: true }));
        this._log && this._log(msg + " (" + pkg.id + ")", "ok");
        // Die Vorlagen im offenen Studio sind jetzt älter als die gespeicherten.
        if (this._cvCache) this._cvCache = {};
      } catch (e) {
        this._cuCardErr = (e && e.message) || String(e);
      }
      await this._cuLoadCards(false);
      this._cuBusy = null;
      this._cuRepaint();
    };

    P._cuSearchCards = async function () {
      if (this._cuBusy) return;
      this._cuBusy = "cardscheck";
      this._cuCardErr = null;
      this._cuRepaint();
      await this._cuLoadCards(true);
      this._cuBusy = null;
      this._cuRepaint();
    };

    P._cuCardAuto = async function (on) {
      try {
        const r = await this._hass.callWS({ type: "casora/card_updates/settings", auto: !!on });
        if (this._cuCards) this._cuCards.auto = !!(r && r.auto);
      } catch (e) {
        this._cuCardErr = (e && e.message) || String(e);
      }
      this._cuRepaint();
    };

    // Eine aufklappbare Zeile, wie bei den Casora-Versionen.
    const foldRow = (self, key, title, sub, tags, fill) => {
      const item = el("div", "cu-item");
      const row = el("button", "cu-row");
      row.type = "button";
      const open = self._cuOpenRows.has(key);
      row.setAttribute("aria-expanded", open ? "true" : "false");
      row.insertAdjacentHTML("beforeend", CHEV);
      row.append(el("span", "cu-v", title), el("span", "cu-d", sub));
      const tg = el("span", "cu-tags");
      tags.forEach(([txt, cls]) => tg.appendChild(el("span", "cu-tag " + cls, txt)));
      row.appendChild(tg);
      const body = el("div", "cu-body");
      body.hidden = !open;
      fill(body);
      row.onclick = () => {
        const now = !self._cuOpenRows.has(key);
        if (now) self._cuOpenRows.add(key); else self._cuOpenRows.delete(key);
        row.setAttribute("aria-expanded", now ? "true" : "false");
        body.hidden = !now;
      };
      item.append(row, body);
      return item;
    };
    const notesInto = (body, md) => {
      if (!md) return;
      const n = el("div", "cu-notes");
      n.appendChild(safeNotes(mdHtml(md)));
      body.appendChild(n);
    };
    const itemList = (body, items, withState) => {
      if (!items || !items.length) return;
      const ul = el("ul", "cu-cards");
      items.forEach((it) => {
        const li = el("li");
        const head = el("div", "cu-cardhead");
        head.appendChild(el("b", "", cardName(it.name)));
        const st = withState && STATE[it.state];
        if (st) head.appendChild(el("span", "cu-tag " + st[1], t(st[0])));
        li.appendChild(head);
        if (it.notes) li.appendChild(el("div", "cu-cardnote", it.notes));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    };

    P._cuFillCards = function (wrap) {
      const c = this._cuCards;
      if (!c && !this._cuCardsErr) return;  // Integration ohne Karten-Updates
      wrap.appendChild(el("div", "cu-h", t("Card Updates")));
      const box = el("div", "cu-box");
      wrap.appendChild(box);
      if (!c) {
        box.appendChild(el("div", "cu-empty", t("Card updates could not be loaded.") + " " + this._cuCardsErr));
        return;
      }
      const head = el("div", "cu-hero cu-cardtop");
      const avail = (c.available || []);
      const open = avail.filter((p) => p.applicable).length;
      const state = el("div", "cu-state" + (open ? " new" : ""));
      state.style.marginTop = "0";
      state.appendChild(el("i"));
      state.appendChild(el("span", "", open === 1 ? t("1 card update available")
        : open ? t("{n} card updates available").replace("{n}", open) : t("All cards up to date")));
      head.appendChild(state);
      head.appendChild(el("div", "cu-sum", t("Fixes for single tiles and popups, without a new Casora version. Your dashboards are refreshed right away; the previous state stays in Rewind.")));
      const acts = el("div", "cu-acts");
      const busy = this._cuBusy === "cardscheck";
      const chk = btn(busy ? t("Searching…") : t("Search Now"), () => this._cuSearchCards(), true);
      chk.disabled = !!this._cuBusy;
      acts.appendChild(chk);
      acts.appendChild(el("div", "cu-when", c.checked
        ? t("Last searched {when}").replace("{when}", ago(this, c.checked)) : t("Not searched yet")));
      head.appendChild(acts);
      const err = this._cuCardErr || c.error;
      if (err) head.appendChild(el("div", "cu-err", err));
      box.appendChild(head);

      // Automatisch übernehmen
      const auto = el("div", "cu-kv cu-auto");
      auto.appendChild(el("span", "", t("Apply automatically")));
      const sw = this._boolSwitch ? this._boolSwitch(!!c.auto, false, (v) => this._cuCardAuto(!!v), t("Apply automatically"))
        : null;
      if (sw) auto.appendChild(sw);
      box.appendChild(auto);

      avail.forEach((p) => {
        const tags = p.applicable ? [[t("NEW"), "new"]] : [[t("Not applicable"), "wait"]];
        const n = (p.items || []).length;
        const sub = n === 1 ? t("1 card") : n ? t("{n} cards").replace("{n}", n) : t("Card update");
        box.appendChild(foldRow(this, "card:" + p.id, fmtDate(this, p.published, true) || p.id, sub, tags, (body) => {
          if (!p.applicable && p.reason) body.appendChild(el("div", "cu-err cu-reason", p.reason));
          notesInto(body, p.notes_md);
          itemList(body, p.items, true);
          if (p.min_casora) body.appendChild(el("div", "cu-meta", t("Needs Casora {v} or newer").replace("{v}", String(p.min_casora))));
          const acts = el("div", "cu-acts");
          const go = btn(this._cuBusy === "cards" ? t("Applying…") : t("Apply"), () => this._cuApplyCards(p));
          go.disabled = !p.applicable || !!this._cuBusy;
          acts.appendChild(go);
          body.appendChild(acts);
          if (p.url && /^https:\/\//.test(p.url)) {
            const a = el("a", "cu-link", t("View on GitHub"));
            a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer";
            body.appendChild(a);
          }
        }));
      });
      (c.applied || []).forEach((a) => {
        const n = (a.items || []).length;
        const sub = n === 1 ? t("1 card") : t("{n} cards").replace("{n}", n);
        box.appendChild(foldRow(this, "done:" + a.id, fmtDate(this, a.published, true) || a.id, sub,
          [[t("Applied"), "inst"]], (body) => {
            body.appendChild(el("div", "cu-meta", t("Applied on {date}").replace("{date}", fmtDate(this, a.applied_at))
              + (a.dashboards ? " · " + (a.dashboards === 1 ? t("1 dashboard updated") : t("{n} dashboards updated").replace("{n}", a.dashboards)) : "")));
            notesInto(body, a.notes_md);
            itemList(body, a.items, false);
            if ((a.skipped || []).length) {
              body.appendChild(el("div", "cu-meta", t("Skipped") + ": " + a.skipped.map((x) => cardName(x.name)
                + (STATE[x.state] ? " (" + t(STATE[x.state][0]) + ")" : "")).join(", ")));
            }
          }));
      });
      if (!avail.length && !(c.applied || []).length) box.appendChild(el("div", "cu-empty", t("No card updates so far.")));
    };

    // ── Seite (Desktop) ──────────────────────────────────────────────────────
    P._cuRender = async function (force) {
      const pane = this.$("pane");
      if (!pane || !this._cuOpen) return;
      css(this);
      const head = this.shadowRoot.querySelector(".insphead");
      if (head) {
        [...head.children].forEach((c) => { if (!c.classList.contains("cu-head")) c.style.display = "none"; });
        let h = head.querySelector(".cu-head");
        if (!h) {
          h = document.createElement("div");
          h.className = "navrow cu-head";
          h.innerHTML = '<div class="detailbar rootlevel"><h3></h3></div>';
          head.appendChild(h);
        }
        h.querySelector("h3").textContent = t("Updates");
      }
      const wrap = el("div", "cu-wrap");
      pane.replaceChildren(wrap);
      this._cuFill(wrap);
      if (force || !this._cuData || (this._cuData.notes_lang && this._cuData.notes_lang !== notesLang(this))) {
        await Promise.all([this._cuLoad(false), this._cuLoadCards(false)]);
        if (!this._cuOpen || pane.firstChild !== wrap) return;
        this._cuFill(wrap);
        this._cuBadge();
      }
    };

    P._cuOpenPage = function () {
      if (this._cvOpen && this._cvClose) {
        this._cvLeaving = true;
        try { this._cvClose(); } finally { this._cvLeaving = false; }
      }
      this._cuOpen = true;
      this.classList.add("contentpage");
      this._cuRender(true);
      this._cuSideRow();
    };

    P._cuClose = function () {
      if (!this._cuOpen) return;
      this._cuOpen = false;
      if (!this._csOpen) this.classList.remove("contentpage");
      this._cuWrap = null;
      const head = this.shadowRoot.querySelector(".insphead");
      if (head) {
        const h = head.querySelector(".cu-head");
        if (h) h.remove();
        [...head.children].forEach((c) => { c.style.display = ""; });
      }
    };

    // Versionen öffnen schließt die Updates (und umgekehrt, oben).
    if (P._cvOpenPage) {
      const cvOpen = P._cvOpenPage;
      P._cvOpenPage = function () {
        if (this._cuOpen) {
          this._cuLeaving = true;
          try { this._cuClose(); } finally { this._cuLeaving = false; }
        }
        return cvOpen.apply(this, arguments);
      };
    }

    const renderForm = P._renderForm;
    P._renderForm = function () {
      const r = renderForm.apply(this, arguments);
      if (this._cuOpen && !this._cuLeaving) this._cuRender();
      return r;
    };

    // ── Seitenleiste: Abschnitt „Casora“ ganz unten ──────────────────────────
    P._cuBadge = function () {
      const b = this.shadowRoot && this.shadowRoot.querySelector("#sidesections .cu-side");
      if (!b) return;
      const n = (available(this) && !(this._cuData && this._cuData.pending_restart) ? 1 : 0) + cardsOpen(this);
      let dot = b.querySelector(".cu-badge");
      if (n && !dot) {
        dot = el("span", "cu-badge");
        b.appendChild(dot);
      } else if (!n && dot) dot.remove();
      if (dot) { dot.textContent = String(n); dot.title = t("Update available"); }
    };

    P._cuSideRow = function () {
      const host = this.shadowRoot.getElementById("sidesections");
      if (!host || !host.children.length || !this._dashUrl) return;
      css(this);
      let h = host.querySelector(".cu-sidehead");
      let b = host.querySelector(".cu-side");
      if (!b) {
        h = h || el("h2", "sidehead cu-sidehead", t("Settings"));
        h.setAttribute("data-no-i18n", "");
        b = el("button", "siderow cu-side");
        b.type = "button";
        const ic = el("span", "sicon");
        ic.style.setProperty("--i", "url('" + ICON + "')");
        ic.style.setProperty("--sc", tint());
        b.append(ic, el("span", "sidelabel", t("Updates")));
        b.onclick = () => { if (!this._cuOpen) this._cuOpenPage(); };
      }
      if (!this._cuCardsAsked && this._hass) {
        this._cuCardsAsked = true;
        this._cuLoadCards(false).then(() => this._cuBadge());
      }
      // Immer ganz unten, auch wenn danach noch Zeilen dazugekommen sind.
      // Die Überschrift setzt das Einstellungen-Modul vor seine Zeilen; nur ohne es steht sie hier.
      if (!host.querySelector(".cs-row")) host.append(h);
      host.append(b);
      if (this._cuOpen) {
        host.querySelectorAll(".siderow").forEach((row) => {
          const mine = row === b;
          row.classList.toggle("on", mine);
          if (mine) row.setAttribute("aria-current", "page"); else row.removeAttribute("aria-current");
        });
      } else {
        b.classList.remove("on");
        b.removeAttribute("aria-current");
      }
      this._cuBadge();
    };

    const renderSidebar = P._renderSidebar;
    P._renderSidebar = function () {
      const r = renderSidebar.apply(this, arguments);
      const host = this.shadowRoot.getElementById("sidesections");
      if (host) {
        host.querySelectorAll(".siderow").forEach((row) => {
          if (row.classList.contains("cu-side")) return;
          row.dataset.cuOn = row.classList.contains("on") ? "1" : "";
          // Ein Klick auf eine andere Seite verlässt die Updates – auch auf die schon aktive
          // (deren eigener Klick täte nichts, sie gilt ja als offen).
          const pick = row.onclick;
          row.onclick = (ev) => {
            if (this._cuOpen) {
              this._cuLeaving = true;
              try {
                this._cuClose();
                if (row.dataset.cuOn === "1") this._renderForm();
                else if (pick) pick.call(row, ev);
              } finally { this._cuLeaving = false; }
              return;
            }
            if (pick) pick.call(row, ev);
          };
        });
      }
      this._cuSideRow();
      return r;
    };

    // Neue Version erschienen oder installiert: Punkt in der Seitenleiste nachziehen.
    const hassDesc = Object.getOwnPropertyDescriptor(P, "hass");
    if (hassDesc && hassDesc.set) {
      Object.defineProperty(P, "hass", {
        ...hassDesc,
        set(hass) {
          hassDesc.set.call(this, hass);
          const id = entityOf(this);
          const st = id && hass && hass.states && hass.states[id];
          const key = st ? st.state + "|" + (st.attributes.latest_version || "") + "|" + !!st.attributes.in_progress : "";
          if (key === this._cuSeen) return;
          const first = this._cuSeen === undefined;
          this._cuSeen = key;
          this._cuBadge();
          // Während die Seite offen ist: Liste neu holen (z. B. nach einer Prüfung in HA).
          if (!first && (this._cuOpen || (this._cuWrap && this._cuWrap.isConnected)) && !this._cuBusy) {
            this._cuLoad(false).then(() => this._cuRepaint());
          }
        },
      });
    }

    // ── Menü: auch ohne Seitenleiste (Handy) erreichbar ──────────────────────
    const menuAt = P._menuAt;
    P._menuAt = function (anchor, items, onPick, opts) {
      if (Array.isArray(items) && items.some((x) => x && x.id === "create") && this._dashUrl && !this._flowMode
        && !items.some((x) => x && x.id === "casora_updates")
        && !(this.classList.contains("split") && this.$("sidesections"))) { // mit Seitenleiste steht es dort
        items = items.concat([{ id: "casora_updates", label: available(this) ? "Updates (1)…" : "Updates…",
          icon: "update", group: "Casora", quiet: true }]);
        const pick = onPick;
        onPick = (id) => (id === "casora_updates" ? this._cuFromMenu() : pick(id));
      }
      return menuAt.call(this, anchor, items, onPick, opts);
    };

    P._cuFromMenu = function () {
      if (this.classList.contains("split") && this.$("sidesections")) return this._cuOpenPage();
      return this._cuSheet();
    };

    // Handy: dieselbe Seite im Blatt.
    P._cuSheet = async function () {
      css(this);
      const s = this._flowScreen({ icon: "update", title: t("Updates"),
        lede: t("Your Casora version, what's new and all earlier versions.") });
      const wrap = el("div", "cu-wrap");
      s.body.appendChild(wrap);
      this._cuFill(wrap);
      this._flowCancel(s.acts);
      await Promise.all([this._cuLoad(false), this._cuLoadCards(false)]);
      if (wrap.isConnected) this._cuFill(wrap);
    };
  });
})();
