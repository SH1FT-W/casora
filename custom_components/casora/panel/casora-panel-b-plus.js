// Studio B: Rückmeldung, Einführung und „Szene aus dem jetzigen Zustand“ (06.10.2026)
//
// Ergänzt das neue Studio (casora-panel-b.js) um das, was die Nutzertests vermisst haben:
// - eine ruhige Meldung unten nach jeder Änderung („Kachel hinzugefügt“ mit „Rückgängig“)
//   und nach dem Speichern; beim allerersten Speichern ein kurzer Erfolgsmoment
// - neue Kacheln kurz hervorheben und in Sicht holen; ohne Gerät gleich die Geräteauswahl
// - Hinweis zur intelligenten Sortierung, Zeitreise an einer Stelle (neben Rückgängig)
// - kurze Einführung beim ersten Öffnen, Leerzustände, weiches Schließen des Inspektors
// - Szenen: „Aus aktuellem Zustand“ speichert eine echte HA-Szene (wie HAs Szenen-Editor)
// Datenmodell, Speichern und Rückgängig bleiben die des Panels – hier wird nur angeschlossen.
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const tr = (x) => (W.casoraI18n && W.casoraI18n.t ? W.casoraI18n.t(x) : x);
  const reduced = () => !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ── Szene aus dem jetzigen Zustand (ohne DOM – dev/unit/szene_aus_zustand.mjs) ─────────
  // Je Domäne nur, was HAs Szenen wiederherstellen können (reproduce_state): Licht mit Helligkeit
  // und genau der Farbe seines Farbmodus, Rollladen mit Position, Thermostat mit Modus/Soll usw.
  const ORDER = ["light", "cover", "climate", "fan", "media_player", "switch", "humidifier", "valve", "input_boolean", "lock"];
  const DOMAINS = new Set(ORDER);
  const pick = (out, a, keys) => keys.forEach((k) => { if (a[k] !== undefined && a[k] !== null) out[k] = a[k]; });

  function sceneState(so) {
    if (!so || !so.entity_id) return null;
    const d = String(so.entity_id).split(".")[0];
    const a = so.attributes || {};
    let st = String(so.state || "");
    if (!DOMAINS.has(d) || /^(unavailable|unknown|)$/.test(st)) return null;
    if (d === "cover" || d === "valve") st = st === "opening" ? "open" : st === "closing" ? "closed" : st;
    if (d === "media_player" && st === "buffering") st = "playing";
    if ((d === "light" || d === "switch" || d === "fan" || d === "input_boolean" || d === "humidifier") && st !== "on" && st !== "off") return null;
    if (d === "lock" && st !== "locked" && st !== "unlocked") return null;
    if ((d === "cover" || d === "valve") && st !== "open" && st !== "closed") return null;
    const out = { state: st };
    if (d === "light" && st === "on") {
      pick(out, a, ["brightness"]);
      const m = a.color_mode;
      if (m) out.color_mode = m;
      if (m === "color_temp") {
        if (a.color_temp_kelvin != null) out.color_temp_kelvin = a.color_temp_kelvin;
        else pick(out, a, ["color_temp"]);
      } else if (m === "hs") pick(out, a, ["hs_color"]);
      else if (m === "xy") pick(out, a, ["xy_color"]);
      else if (m === "rgb") pick(out, a, ["rgb_color"]);
      else if (m === "rgbw") pick(out, a, ["rgbw_color"]);
      else if (m === "rgbww") pick(out, a, ["rgbww_color"]);
      if (a.effect && !/^(off|none)$/i.test(String(a.effect))) out.effect = a.effect;
    } else if (d === "cover") {
      pick(out, a, ["current_position", "current_tilt_position"]);
    } else if (d === "valve") {
      pick(out, a, ["current_position"]);
    } else if (d === "climate") {
      pick(out, a, ["temperature", "target_temp_high", "target_temp_low", "preset_mode", "fan_mode", "swing_mode", "humidity"]);
    } else if (d === "media_player" && st !== "off") {
      pick(out, a, ["volume_level", "is_volume_muted", "source"]);
    } else if (d === "fan" && st === "on") {
      pick(out, a, ["percentage", "preset_mode", "oscillating", "direction"]);
    } else if (d === "humidifier" && st === "on") {
      pick(out, a, ["humidity", "mode"]);
    }
    return out;
  }

  const HUES = [[15, "red"], [45, "orange"], [70, "yellow"], [165, "green"], [195, "turquoise"], [255, "blue"], [290, "purple"], [345, "pink"], [361, "red"]];
  const HVAC = { heat: "Heat", cool: "Cool", auto: "Auto", heat_cool: "Heat/Cool", dry: "Dry", fan_only: "Fan" };

  // Lesbarer Zustand („60 %, warm“, „Heizen 21 °C“); t übersetzt einzelne Wörter, lang formatiert Zahlen.
  function describe(so, t, lang, unit) {
    t = t || ((x) => x);
    const s = sceneState(so);
    if (!s) return t("Unavailable");
    const d = String(so.entity_id).split(".")[0];
    const a = so.attributes || {};
    const num = (v) => { try { return Number(v).toLocaleString(lang || "en", { maximumFractionDigits: 1 }); } catch (e) { return String(v); } };
    const pct = (v) => Math.round(v) + " %";
    const parts = [];
    if (d === "light") {
      if (s.state !== "on") return t("Off");
      if (s.brightness != null) parts.push(pct(s.brightness / 255 * 100));
      const k = s.color_temp_kelvin || (s.color_temp ? 1e6 / s.color_temp : 0);
      if (k) parts.push(t(k <= 3300 ? "warm" : k >= 5000 ? "cool" : "neutral"));
      else {
        const hs = s.hs_color || a.hs_color;
        if (s.color_mode && /^(hs|xy|rgb|rgbw|rgbww)$/.test(s.color_mode) && Array.isArray(hs)) {
          const h = ((Number(hs[0]) % 360) + 360) % 360;
          parts.push(t((HUES.find((x) => h < x[0]) || HUES[0])[1]));
        }
      }
      return parts.join(", ") || t("On");
    }
    if (d === "cover" || d === "valve") {
      if (s.state === "closed") return t("Closed");
      const p = s.current_position;
      return p == null || p >= 100 ? t("Open") : t("Open") + " " + pct(p);
    }
    if (d === "climate") {
      if (s.state === "off") return t("Off");
      parts.push(t(HVAC[s.state] || s.state));
      if (s.temperature != null) parts.push(num(s.temperature) + " " + (unit || "°C"));
      else if (s.target_temp_low != null && s.target_temp_high != null) parts.push(num(s.target_temp_low) + "–" + num(s.target_temp_high) + " " + (unit || "°C"));
      return parts.join(" ");
    }
    if (d === "media_player") {
      if (s.state === "off") return t("Off");
      parts.push(t(s.state === "playing" ? "Playing" : s.state === "paused" ? "Paused" : "On"));
      if (s.volume_level != null) parts.push(t("Volume") + " " + pct(s.volume_level * 100));
      return parts.join(", ");
    }
    if (d === "fan") return s.state !== "on" ? t("Off") : s.percentage != null ? pct(s.percentage) : t("On");
    if (d === "humidifier") return s.state !== "on" ? t("Off") : s.humidity != null ? t("On") + ", " + pct(s.humidity) : t("On");
    if (d === "lock") return t(s.state === "locked" ? "Locked" : "Unlocked");
    return t(s.state === "on" ? "On" : "Off");
  }

  // Geräte eines HA-Bereichs, die eine Szene festhalten kann (sichtbar, keine Konfig-/Diagnose-Entitäten).
  function areaEntities(hass, areaId) {
    const H = hass || {};
    const E = H.entities || {}, D = H.devices || {}, S = H.states || {};
    const name = (id) => String(((S[id] || {}).attributes || {}).friendly_name || id);
    return Object.keys(E).filter((id) => {
      const e = E[id] || {};
      if (!DOMAINS.has(id.split(".")[0]) || !sceneState(S[id])) return false;
      if (e.hidden || e.hidden_by || e.disabled_by || e.entity_category) return false;
      const aid = e.area_id || (e.device_id ? (D[e.device_id] || {}).area_id : null);
      return !!areaId && aid === areaId;
    }).sort((x, y) => ORDER.indexOf(x.split(".")[0]) - ORDER.indexOf(y.split(".")[0]) || name(x).localeCompare(name(y)));
  }

  // Schlösser und Ventile nicht von selbst in eine Szene: eine Abend-Szene soll keine Tür öffnen.
  const checkedByDefault = (id) => !/^(lock|valve)\./.test(id);

  // Konfiguration wie HAs Szenen-Editor sie schreibt (POST config/scene/config/<id>).
  function buildScene(name, ids, states, opts) {
    const o = opts || {};
    const entities = {};
    (ids || []).forEach((id) => { const s = sceneState((states || {})[id]); if (s) entities[id] = s; });
    const cfg = { id: String(o.id || Date.now()), name: String(name || "").trim(), entities, metadata: {} };
    if (o.icon) cfg.icon = o.icon;
    return cfg;
  }

  W.casoraSceneFromState = { sceneState, describe, areaEntities, buildScene, checkedByDefault };
  if (typeof customElements === "undefined") return;

  const ICON = {
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const svg = (k, sw) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2)
    + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>";
  const DOMAIN_ICON = { light: ["mdi:lightbulb", "mdi:lightbulb-outline"], cover: ["mdi:window-shutter-open", "mdi:window-shutter"],
    climate: ["mdi:thermostat", "mdi:thermostat"], fan: ["mdi:fan", "mdi:fan-off"], media_player: ["mdi:speaker", "mdi:speaker-off"],
    switch: ["mdi:toggle-switch", "mdi:toggle-switch-off-outline"], humidifier: ["mdi:air-humidifier", "mdi:air-humidifier-off"],
    valve: ["mdi:valve-open", "mdi:valve-closed"], input_boolean: ["mdi:toggle-switch", "mdi:toggle-switch-off-outline"],
    lock: ["mdi:lock-open-variant", "mdi:lock"] };
  const INTRO = "casora.studio.intro";
  const FIRST_SAVE = "casora.studio.saved1";
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return v; };

  const CSS = `
    /* ── Meldung unten (Toast) ─────────────────────────────────────── */
    .btoast {
      position:fixed; z-index:60; left:50%; bottom:calc(22px + env(safe-area-inset-bottom, 0px));
      display:flex; align-items:center; gap:6px; max-width:min(520px, calc(100vw - 32px)); box-sizing:border-box;
      padding:7px 7px 7px 16px; min-height:44px; border-radius:16px;
      background:var(--casora-studio-toast, rgba(36,36,40,.94)); color:#fff;
      font:inherit; font-size:var(--t-foot, 14px); font-weight:550; letter-spacing:0;
      box-shadow:0 10px 34px rgba(0,0,0,.24); pointer-events:none;
      opacity:0; transform:translate(-50%, 10px); transition:opacity .2s ease, transform .24s var(--ease, ease);
      -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px);
    }
    .btoast.on { opacity:1; transform:translate(-50%, 0); pointer-events:auto; }
    .btoast .btmsg { flex:1 1 auto; min-width:0; padding-right:6px; line-height:1.3; }
    .btoast .btico { width:20px; height:20px; flex:none; display:grid; place-items:center; margin-left:-4px; color:#7ee08f; }
    .btoast .btico svg { width:18px; height:18px; }
    .btoast .btico:empty { display:none; }
    .btoast button { border:0; cursor:pointer; font:inherit; font-weight:650; color:inherit; background:none; }
    .btoast .btact { padding:8px 12px; border-radius:11px; background:rgba(255,255,255,.14); white-space:nowrap; }
    .btoast .btact:hover { background:rgba(255,255,255,.22); }
    .btoast .btx { width:30px; height:30px; border-radius:50%; display:grid; place-items:center; opacity:.7; padding:0; }
    .btoast .btx svg { width:15px; height:15px; }
    .btoast .btact:focus-visible, .btoast .btx:focus-visible { outline:2px solid #fff; outline-offset:1px; }
    .btoast .btact[hidden], .btoast .btx[hidden] { display:none; }
    .btoast.err { background:var(--casora-studio-bad, #C9342C); }
    .btoast.err .btico { color:#fff; }
    :host(.bmode.phone) .btoast { bottom:calc(84px + env(safe-area-inset-bottom, 0px)); }
    :host(.bmode.phone.binsp) .btoast { bottom:auto; top:calc(70px + env(safe-area-inset-top, 0px)); transform:translate(-50%, -10px); }
    :host(.bmode.phone.binsp) .btoast.on { transform:translate(-50%, 0); }
    /* Erfolgsmoment nach dem allerersten Speichern: größer, mit gezeichnetem Haken. */
    .btoast.big { padding:14px 18px 14px 14px; gap:12px; border-radius:20px; }
    .btoast.big .btico { width:38px; height:38px; margin:0; border-radius:50%; background:#34C759; color:#fff; }
    .btoast.big .btico svg { width:22px; height:22px; }
    .btoast.big .btico path { stroke-dasharray:24; stroke-dashoffset:24; animation:bTick .5s .12s ease forwards; }
    .btoast .btsub { display:block; font-weight:450; opacity:.8; margin-top:2px; }
    @keyframes bTick { to { stroke-dashoffset:0; } }

    /* ── Hervorheben (neue/geänderte Kachel) ───────────────────────── */
    .bflash { animation:bFlash 1.7s ease; }
    @keyframes bFlash {
      0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent, #B67A50) 0%, transparent); }
      18% { box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #B67A50) 70%, transparent); }
      60% { box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #B67A50) 45%, transparent); }
      100% { box-shadow:0 0 0 0 transparent; }
    }

    /* ── Zeitreise neben Rückgängig (Desktop/Tablet) ───────────────── */
    #brewind { display:none; }
    :host(.bmode:not(.phone):not(.flow)) #brewind.has { display:inline-flex; }
    #brewind svg { width:20px; height:20px; }

    /* ── Hinweis „Handy weicht ab“: ruhig, kein Warnorange ─────────── */
    :host(.bmode) .diffs .ddot { background:var(--ink-3, rgba(127,127,127,.7)); width:6px; height:6px; flex-basis:6px; }
    :host(.bmode) button.diffs { font-weight:550; color:var(--ink-2, inherit); }

    /* ── Szenen: Farbe als sichtbarer Knopf, Name öffnet sie auch ───── */
    :host(.bmode) .scenecolor .scname { cursor:pointer; }
    :host(.bmode) .scenecolor .scpick {
      gap:7px; height:32px; margin-right:0; padding:0 10px 0 9px; border-radius:999px;
      box-shadow:inset 0 0 0 1px var(--hair, rgba(127,127,127,.32));
    }
    :host(.bmode) .scenecolor .scpick .scval {
      position:static; width:auto; height:auto; overflow:visible; clip-path:none; font-size:var(--t-foot, 13px); }
    :host(.bmode) .scenecolor .scpick::after {
      content:""; width:7px; height:7px; margin:-3px 0 0 1px; border:solid currentColor; border-width:0 1.8px 1.8px 0;
      transform:rotate(45deg); opacity:.55; }

    /* ── Leerzustände und Hinweise in der Liste ───────────────────── */
    .bempty { margin:4px 2px 10px; padding:14px 14px 12px; border-radius:14px; background:var(--chip, rgba(127,127,127,.1));
      color:var(--ink-2, inherit); font-size:var(--t-foot, 14px); line-height:1.4; }
    .bempty b { display:block; color:var(--ink, inherit); font-weight:650; margin-bottom:3px; }
    .bempty button { margin-top:10px; border:0; border-radius:10px; padding:9px 13px; cursor:pointer; font:inherit; font-weight:650;
      background:var(--casora-studio-done, var(--accent, #B67A50)); color:#fff; }
    .bempty button:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }

    /* ── Handy: untere Leiste lesbar, auch dunkel ──────────────────── */
    :host(.bmode.phone) .bbar button:not(.bplus) { color:var(--ink, #1c1c1e); }
    :host(.bmode.phone:not(.is-light)) .bbar { background:var(--pane-solid, rgba(29,31,37,.97)); }
    :host(.bmode.phone:not(.is-light)) .bbar button:not(.bplus) { color:rgba(255,255,255,.92); }
    :host(.bmode.phone) .bscrim { animation:bFade .22s ease; }
    @keyframes bFade { from { opacity:0; } }

    /* ── Einführung ───────────────────────────────────────────────── */
    .bintro { position:fixed; inset:0; z-index:70; }
    .bintro .bspot { position:fixed; border-radius:18px; pointer-events:none;
      box-shadow:0 0 0 200vmax rgba(10,10,14,.42), 0 0 0 3px rgba(255,255,255,.9);
      transition:left .32s var(--ease, ease), top .32s var(--ease, ease), width .32s var(--ease, ease), height .32s var(--ease, ease); }
    .bintro .bcoach { position:fixed; width:min(330px, calc(100vw - 32px)); box-sizing:border-box; padding:18px 18px 14px;
      border-radius:20px; background:var(--card, #fff); color:var(--ink, #1c1c1e); box-shadow:0 18px 50px rgba(0,0,0,.3);
      transition:left .32s var(--ease, ease), top .32s var(--ease, ease), opacity .2s ease; }
    :host(:not(.is-light)) .bintro .bcoach { background:var(--pane-solid, #24262c); color:#fff; }
    .bintro .bstep { font-size:12px; font-weight:650; letter-spacing:.02em; color:var(--ink-3, rgba(127,127,127,.95)); }
    .bintro h3 { margin:4px 0 6px; font-size:17px; font-weight:700; letter-spacing:-.01em; }
    .bintro p { margin:0; font-size:var(--t-foot, 14px); line-height:1.45; color:var(--ink-2, inherit); }
    .bintro .bacts { display:flex; justify-content:space-between; align-items:center; margin-top:14px; }
    .bintro .bdots { display:flex; gap:5px; }
    .bintro .bdots i { width:6px; height:6px; border-radius:50%; background:var(--ink-3, rgba(127,127,127,.5)); opacity:.45; }
    .bintro .bdots i.on { opacity:1; background:var(--casora-studio-done, var(--accent, #B67A50)); }
    .bintro button { border:0; border-radius:11px; padding:9px 14px; cursor:pointer; font:inherit; font-weight:650; font-size:14px; }
    .bintro .bskip { background:none; color:var(--ink-2, inherit); padding-left:4px; padding-right:4px; }
    .bintro .bnext { background:var(--casora-studio-done, var(--accent, #B67A50)); color:#fff; margin-left:8px; }
    .bintro button:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }
    .bintro.in .bcoach { animation:bCoachIn .26s var(--ease, ease); }
    @keyframes bCoachIn { from { opacity:0; transform:translateY(8px); } }

    /* ── Szene aus dem jetzigen Zustand ───────────────────────────── */
    .bsfs { position:fixed; inset:0; z-index:65; display:flex; align-items:center; justify-content:center; }
    .bsfs .bsscrim { position:absolute; inset:0; background:rgba(10,10,14,.36); animation:bFade .2s ease; }
    .bsfs .bscard { position:relative; display:flex; flex-direction:column; width:min(520px, calc(100vw - 32px));
      max-height:min(760px, calc(100dvh - 48px)); box-sizing:border-box; border-radius:24px; overflow:hidden;
      background:var(--card, #fff); color:var(--ink, #1c1c1e); box-shadow:0 24px 70px rgba(0,0,0,.32);
      animation:bCardIn .26s var(--ease, ease); }
    :host(:not(.is-light)) .bsfs .bscard { background:var(--pane-solid, #24262c); color:#fff; }
    @keyframes bCardIn { from { opacity:0; transform:translateY(14px) scale(.985); } }
    .bsfs .bshead { padding:22px 22px 8px; }
    .bsfs h2 { margin:0 0 6px; font-size:20px; font-weight:700; letter-spacing:-.01em; }
    .bsfs .bslede { margin:0; font-size:var(--t-foot, 14px); line-height:1.45; color:var(--ink-2, inherit); }
    .bsfs .bsform { padding:8px 22px 0; display:grid; gap:10px; }
    .bsfs label.bsl { display:grid; gap:5px; font-size:13px; font-weight:600; color:var(--ink-2, inherit); }
    .bsfs input[type=text], .bsfs select { box-sizing:border-box; width:100%; height:44px; padding:0 12px; border-radius:12px;
      border:0; background:var(--field, rgba(127,127,127,.12)); color:inherit; font:inherit; font-size:16px; }
    .bsfs input[type=text]:focus-visible, .bsfs select:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:1px; }
    .bsfs .bslisthead { display:flex; justify-content:space-between; align-items:baseline; padding:14px 22px 4px;
      font-size:13px; font-weight:600; color:var(--ink-2, inherit); }
    .bsfs .bslisthead button { border:0; background:none; color:var(--casora-studio-done, var(--accent, #B67A50)); font:inherit; font-weight:650; cursor:pointer; padding:4px; }
    .bsfs .bslist { overflow-y:auto; padding:0 14px 6px; min-height:80px; }
    .bsfs .bsrow { display:flex; align-items:center; gap:12px; min-height:52px; padding:4px 8px; border-radius:12px; cursor:pointer; }
    .bsfs .bsrow + .bsrow { box-shadow:inset 0 1px 0 var(--hair, rgba(127,127,127,.16)); }
    .bsfs .bsrow:hover { background:var(--chip, rgba(127,127,127,.08)); }
    .bsfs .bsrow input { width:20px; height:20px; flex:none; margin:0; accent-color:var(--casora-studio-done, var(--accent, #B67A50)); }
    .bsfs .bsrow ha-icon { --mdc-icon-size:22px; flex:none; color:var(--ink-3, rgba(127,127,127,.9)); }
    .bsfs .bsrow.lit ha-icon { color:#F5A623; }
    .bsfs .bsname { flex:1 1 auto; min-width:0; }
    .bsfs .bsname b { display:block; font-weight:600; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bsfs .bsname span { display:block; font-size:13px; color:var(--ink-2, inherit); margin-top:1px; }
    .bsfs .bsnone { padding:18px 8px; color:var(--ink-2, inherit); font-size:var(--t-foot, 14px); line-height:1.45; }
    .bsfs .bsfoot { display:flex; justify-content:flex-end; gap:10px; padding:14px 22px calc(18px + env(safe-area-inset-bottom, 0px));
      box-shadow:inset 0 1px 0 var(--hair, rgba(127,127,127,.16)); }
    .bsfs .bsfoot button { border:0; border-radius:12px; padding:11px 16px; cursor:pointer; font:inherit; font-weight:650; font-size:15px;
      background:var(--chip, rgba(127,127,127,.14)); color:inherit; }
    .bsfs .bsfoot .bsgo { background:var(--casora-studio-done, var(--accent, #B67A50)); color:#fff; }
    .bsfs .bsfoot .bsgo:disabled { opacity:.45; cursor:default; }
    .bsfs .bsfoot button:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:2px; }
    .bsfs .bserr { color:var(--casora-studio-bad, #FF453A); font-size:13px; padding:6px 22px 0; }
    :host(.phone) .bsfs { align-items:flex-end; }
    :host(.phone) .bsfs .bscard { width:100vw; max-height:90dvh; border-radius:24px 24px 0 0; animation-name:bSheetUp; }
    @keyframes bSheetUp { from { transform:translateY(60px); opacity:.5; } }

    @media (prefers-reduced-motion: reduce) {
      .btoast, .bintro .bspot, .bintro .bcoach { transition:none !important; }
      .bflash { animation:none; box-shadow:0 0 0 3px var(--accent, #B67A50); }
      .bsfs .bscard, .bsfs .bsscrim, .bintro.in .bcoach, :host(.bmode.phone) .bscrim { animation:none !important; }
      .btoast.big .btico path { animation:none; stroke-dashoffset:0; }
    }
  `;

  // Element in seinem scrollenden Rahmen sichtbar machen – nicht per scrollIntoView, das schob im
  // neuen Aufbau die ganze Seite samt Vorschau weg. stop: höchster Rahmen, der scrollen darf.
  const reveal = (el, stop) => {
    for (let sc = el.parentElement; sc && sc !== stop; sc = sc.parentElement) {
      const cs = getComputedStyle(sc);
      const r = el.getBoundingClientRect(), rs = sc.getBoundingClientRect();
      if (sc.scrollWidth > sc.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX)) {
        if (r.left < rs.left + 8) sc.scrollLeft -= rs.left + 8 - r.left;
        else if (r.right > rs.right - 8) sc.scrollLeft += r.right - rs.right + 8;
      }
      if (sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) {
        if (r.top < rs.top + 8) sc.scrollTop -= rs.top + 8 - r.top;
        else if (r.bottom > rs.bottom - 8) sc.scrollTop += r.bottom - rs.bottom + 8;
      }
    }
  };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    const wrap = (name, make) => { const orig = P[name]; if (typeof orig === "function") P[name] = make(orig); };
    const on = (p) => p.classList.contains("bmode") && !p.classList.contains("flow");
    const isPhone = (p) => p.classList.contains("phone");
    const room$ = (p) => p._state && p._state.compact.rooms[p._room];

    P._bPlusCss = function () {
      const root = this.shadowRoot;
      if (root && !root.getElementById("bplus-css")) {
        const st = document.createElement("style");
        st.id = "bplus-css";
        st.textContent = CSS;
        root.appendChild(st);
      }
    };

    // ── Meldung unten ────────────────────────────────────────────────
    // msg ist schon übersetzt. o: { action: {label, run}, kind: "ok"|"err", ms, big, sub, icon: false }
    P._bToast = function (msg, o) {
      o = o || {};
      this._bPlusCss();
      const root = this.shadowRoot;
      let el = root.querySelector(".btoast");
      if (!el) {
        el = document.createElement("div");
        el.className = "btoast";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        el.innerHTML = '<span class="btico"></span><span class="btmsg" data-no-i18n></span>'
          + '<button type="button" class="btact" data-no-i18n hidden></button>'
          + '<button type="button" class="btx" hidden>' + svg("x", 2.4) + "</button>";
        el.querySelector(".btx").setAttribute("aria-label", tr("Close"));
        el.querySelector(".btx").onclick = () => this._bToastHide();
        el.addEventListener("pointerenter", () => { clearTimeout(this._bToastT); });
        el.addEventListener("pointerleave", () => { if (el.classList.contains("on") && !el.classList.contains("err")) this._bToastLater(2200); });
        root.appendChild(el);
      }
      const same = el.classList.contains("on") && el.dataset.msg === msg && !o.action;
      el.dataset.msg = msg;
      const m = el.querySelector(".btmsg");
      m.textContent = msg;
      if (o.sub) { const s = document.createElement("span"); s.className = "btsub"; s.textContent = o.sub; m.appendChild(s); }
      const ico = el.querySelector(".btico");
      ico.innerHTML = o.kind === "err" ? "" : o.icon === false ? "" : svg("check", o.big ? 3 : 2.6);
      const act = el.querySelector(".btact");
      act.hidden = !o.action;
      if (o.action) {
        act.textContent = o.action.label;
        act.onclick = () => { this._bToastHide(); try { o.action.run(); } catch (e) { console.warn("Casora Studio:", e); } };
      }
      el.querySelector(".btx").hidden = o.kind !== "err";
      el.classList.toggle("err", o.kind === "err");
      el.classList.toggle("big", !!o.big);
      // Waagrecht über der Vorschau, nicht über dem Inspektor (Desktop).
      if (!isPhone(this)) {
        const map = root.querySelector(".stage") || root.querySelector(".card.map");
        const r = map && map.getBoundingClientRect();
        el.style.left = r && r.width ? Math.round(r.left + r.width / 2) + "px" : "";
      } else el.style.left = "";
      if (!same) {
        el.classList.remove("on");
        void el.offsetWidth;
      }
      el.classList.add("on");
      clearTimeout(this._bToastT);
      if (o.kind !== "err") this._bToastLater(o.ms || (o.action ? 6000 : o.big ? 4200 : 2600));
    };
    P._bToastLater = function (ms) {
      clearTimeout(this._bToastT);
      this._bToastT = setTimeout(() => this._bToastHide(), ms);
    };
    P._bToastHide = function () {
      clearTimeout(this._bToastT);
      const el = this.shadowRoot && this.shadowRoot.querySelector(".btoast");
      if (el) el.classList.remove("on");
    };

    // Statuszeile des bisherigen Studios: im neuen Studio als Meldung unten.
    const SMART = "Smart Sort is on – reorder in the Tiles list";
    wrap("_status", (orig) => function (msg, kind) {
      if (!this.classList.contains("bmode") || this.classList.contains("flow") || !msg) return orig.apply(this, arguments);
      orig.call(this, "");
      if (msg === SMART) return this._bSmartToast();
      this._bToast(tr(msg), { kind: kind === "err" ? "err" : "ok", icon: kind === "ok" || kind === "err" ? undefined : false });
    });

    // ── Änderungen erkennen ──────────────────────────────────────────
    const J = (x) => JSON.stringify(x === undefined ? null : x);
    const tileName = (t) => {
      const I = W.__casoraPanelInternals || {};
      const inner = (t && t.card) || (t && Array.isArray(t.cards) && t.cards[0]) || t;
      const ty = I.tileTypeAny ? (I.tileTypeAny(t) || I.tileTypeAny(inner)) : null;
      return (t && t.name) || (inner && inner.name) || (ty && tr(ty.label)) || tr("Tile");
    };
    P._bDiff = function (prev, cur) {
      const pr = (prev && prev.rooms) || [], cr = (cur && cur.rooms) || [];
      if (cr.length > pr.length) {
        const r = cr.find((x) => !pr.some((p) => p.path === x.path));
        return { kind: "room+", label: r ? this._roomLabel(r) : "" };
      }
      if (cr.length < pr.length) {
        const r = pr.find((x) => !cr.some((c) => c.path === x.path));
        return { kind: "room-", label: r ? (r.name || r.title || "") : "" };
      }
      if (J(pr.map((r) => r.path)) !== J(cr.map((r) => r.path))) return { kind: "roomorder" };
      const room = cr[this._room];
      const before = room && pr.find((p) => p.path === room.path);
      if (!before) return { kind: "edit" };
      if (before.name !== room.name) return { kind: "roomname" };
      const a = (before.tiles || []).map(J), b = (room.tiles || []).map(J);
      const left = (xs, ys) => {
        const pool = new Map();
        ys.forEach((y) => pool.set(y, (pool.get(y) || 0) + 1));
        return xs.map((x, i) => (pool.get(x) ? (pool.set(x, pool.get(x) - 1), -1) : i)).filter((i) => i >= 0);
      };
      if (b.length === a.length + 1) {
        const i = left(b, a)[0];
        return { kind: "tile+", tile: room.tiles[i == null ? b.length - 1 : i] };
      }
      if (b.length === a.length - 1) {
        const i = left(a, b)[0];
        return { kind: "tile-", label: tileName(before.tiles[i == null ? 0 : i]) };
      }
      if (a.length === b.length && a.join("\n") !== b.join("\n") && a.slice().sort().join("\n") === b.slice().sort().join("\n")) {
        return { kind: "tileorder" };
      }
      return { kind: "edit" };
    };

    wrap("_markDirty", (orig) => function () {
      const p0 = this._lastPrint;
      const r = orig.apply(this, arguments);
      try {
        if (on(this) && this._state && this._lastPrint !== p0 && p0 !== undefined && !this._bQuiet) {
          const st = this._undoStack || [];
          const snap = st[st.length - 1];
          // Beim Laden gleicht das Panel selbst ab und setzt den Verlauf danach zurück – das ist
          // keine Änderung des Nutzers. Erst melden, wenn der Schritt im Verlauf geblieben ist.
          if (snap && !this._bLoading) setTimeout(() => {
            if (!this._bLoading && (this._undoStack || []).indexOf(snap) >= 0) this._bChanged(snap);
          }, 0);
        }
      } catch (e) { console.warn("Casora Studio:", e); }
      return r;
    });

    wrap("_load", (orig) => async function () {
      this._bLoading = true;
      try { return await orig.apply(this, arguments); } finally { setTimeout(() => { this._bLoading = false; }, 600); }
    });

    P._bChanged = function (snap) {
      const d = this._bDiff(snap.s[0], this._state.compact);
      const now = Date.now();
      const soft = d.kind === "edit" || d.kind === "roomname";
      // Tippen in einem Feld ergibt viele kleine Schritte: eine Meldung, „Rückgängig“ nimmt alle zurück.
      if (!soft || !this._bGroup || !this._bGroup.soft || now - this._bGroup.t > 2500) this._bGroup = { snap, soft };
      this._bGroup.t = now;
      const group = this._bGroup;
      const undo = { label: tr("Undo"), run: () => this._bUndoTo(group.snap) };
      clearTimeout(this._bSoftT);
      if (soft) {
        this._bSoftT = setTimeout(() => {
          const first = !this._bToldDone;
          this._bToldDone = true;
          this._bToast(tr(d.kind === "roomname" ? "Room renamed" : "Change applied"),
            { action: undo, sub: first ? tr("Done saves it to your dashboard.") : "" });
        }, 900);
        return;
      }
      if (d.kind === "tile+") {
        this._bToast(tr("Tile added"), { action: undo });
        this._bNewTile(d.tile);
      } else if (d.kind === "tile-") {
        this._bToast(tr("Tile removed") + ": " + d.label, { action: undo });
        // Der Inspektor zeigte danach noch Kopf und Namen der entfernten Kachel.
        const room = room$(this);
        if (this._sel && this._sel.group === "tiles" && room && !(room.tiles || []).some((t) => this._tileKey(t) === this._sel.key)) {
          requestAnimationFrame(() => { this._sel = null; this._renderForm(); });
        }
      } else if (d.kind === "tileorder") {
        const smart = this._smartSortOn && this._smartSortOn();
        this._bToast(tr("Tile order changed"), { action: undo, sub: smart ? tr("Smart Sort keeps active tiles in front in the preview.") : "" });
      } else if (d.kind === "room+") this._bToast(tr("Room added") + (d.label ? ": " + d.label : ""), { action: undo });
      else if (d.kind === "room-") this._bToast(tr("Room deleted") + (d.label ? ": " + d.label : ""), { action: undo, sub: tr("Done removes it for good.") });
      else if (d.kind === "roomorder") this._bToast(tr("Room order changed"), { action: undo });
    };

    // Zurück auf einen Stand vor der Meldung (auch über mehrere Tipp-Schritte).
    P._bUndoTo = function (snap) {
      const st = this._undoStack || [];
      const i = st.indexOf(snap);
      if (i >= 0) this._undoStack = st.slice(0, i + 1);
      this._bQuietUndo = true;
      try { this._undo(); } finally { this._bQuietUndo = false; }
      this._bQuiet = true;
      try { this._markDirty(); } finally { this._bQuiet = false; }
      this._bGroup = null;
      this._bToast(tr("Undone"), { ms: 1800 });
    };
    wrap("_undo", (orig) => function () {
      const had = (this._undoStack || []).length;
      const r = orig.apply(this, arguments);
      if (had && on(this) && !this._bQuietUndo) {
        this._bGroup = null;
        clearTimeout(this._bSoftT);
        this._bToast(tr("Undone"), { ms: 1800 });
      }
      return r;
    });

    // Neue Kachel: hervorheben, Editor öffnen (am Handy tut das schon casora-panel-b.js) und ohne
    // Gerät gleich die Geräteauswahl – bisher stand sie still mit „Gerät fehlt“ am Listenende.
    P._bNewTile = function (tile) {
      if (!tile) return;
      const key = this._tileKey(tile);
      const phone = isPhone(this);
      if (!phone) requestAnimationFrame(() => this._select({ group: "tiles", key, label: tileName(tile) }));
      setTimeout(() => {
        this._bFlash("t:" + key);
        const missing = !tile.entity && !(tile.card && tile.card.entity);
        if (!missing) return;
        const box = this.shadowRoot.querySelector("#pane #band-tiles .tile.sel");
        const inp = box && box.querySelector(".combo.hasent.noent input");
        if (inp && this._sel && this._sel.key === key) {
          if (!phone) inp.focus({ preventScroll: true });
          inp.click();
        }
      }, phone ? 420 : 360);
    };

    P._bFlash = function (mk) {
      const go = (n) => {
        const root = this.shadowRoot;
        const el = root.querySelector('.card.map [data-mk="' + mk + '"]');
        if (!el || !el.getClientRects().length) { if (n > 0) setTimeout(() => go(n - 1), 140); return; }
        reveal(el, root.querySelector(".card.map") && root.querySelector(".card.map").parentElement);
        el.classList.remove("bflash");
        void el.offsetWidth;
        el.classList.add("bflash");
        setTimeout(() => el.classList.remove("bflash"), 1800);
        const k = mk.replace(/^t:/, "");
        const row = root.querySelector('#pane #band-tiles .tile[data-k="' + k + '"]:not(.sel)');
        if (row) { reveal(row, root.querySelector(".inspector")); row.classList.add("bflash"); setTimeout(() => row.classList.remove("bflash"), 1800); }
      };
      go(8);
    };

    // ── Speichern ────────────────────────────────────────────────────
    wrap("_save", (orig) => async function () {
      const ok = await orig.apply(this, arguments);
      if (ok && this.classList.contains("bmode")) {
        clearTimeout(this._bSoftT);
        this._bGroup = null;
        if (!ls(FIRST_SAVE)) {
          ls(FIRST_SAVE, "1");
          this._bHoldUntil = Date.now() + 1500;
          this._bToast(tr("Saved"), { big: true, sub: tr("Your dashboard now shows exactly what you built here.") });
        } else this._bToast(tr("Saved"));
      }
      return ok;
    });
    // „Fertig“ verlässt das Studio gleich: den Erfolgsmoment erst zu Ende zeigen.
    wrap("_openDash", (orig) => function () {
      const wait = (this._bHoldUntil || 0) - Date.now();
      if (wait > 0 && this.classList.contains("bmode")) {
        const args = arguments;
        setTimeout(() => orig.apply(this, args), wait);
        return undefined;
      }
      return orig.apply(this, arguments);
    });

    // ── Intelligente Sortierung sichtbar ─────────────────────────────
    P._bSmartOff = function () {
      const room = room$(this);
      if (!room) return;
      room._row = room._row || { type: "custom:casora-smart-row" };
      room._row.sort = false;
      if (this._applyMiniSort) this._applyMiniSort(true);
      this._bQuiet = true;
      try { this._markDirty(); } finally { this._bQuiet = false; }
      this._renderForm();
      this._bToast(tr("Smart Sort off – the preview uses your order"));
    };
    P._bSmartToast = function () {
      const now = Date.now();
      if (now - (this._bSmartT || 0) < 1500) return;
      this._bSmartT = now;
      this._bToast(tr("Smart Sort is on"), { icon: false, sub: tr("Active tiles move to the front on their own."),
        action: { label: tr("Turn off"), run: () => this._bSmartOff() } });
    };

    // ── Zeitreise an einer Stelle ────────────────────────────────────
    // Desktop/Tablet: Knopf neben Rückgängig. Handy: im „…“-Menü direkt unter Rückgängig.
    // Das Titelmenü führt sie nicht mehr (war am Handy doppelt).
    wrap("_bDocItems", (orig) => function () {
      return orig.apply(this, arguments).filter((x) => x.id !== "doc:versions");
    });
    wrap("_menuAt", (orig) => function (anchor, items, onPick, mopts) {
      if (on(this) && Array.isArray(items)) {
        // Handy „…“: Zeitreise unter Rückgängig (casora-panel-versions.js fügt sie dann nicht noch einmal an).
        const u = items.findIndex((x) => x && x.id === "undo");
        if (isPhone(this) && u >= 0 && items.some((x) => x && x.id === "hints") && typeof this._cvFromMenu === "function"
          && this._dashUrl && !items.some((x) => x && x.id === "casora_versions")) {
          items = items.slice();
          items.splice(u + 1, 0, { id: "casora_versions", label: "Rewind…", icon: "clock", group: items[u].group, quiet: true });
          const pick = onPick;
          onPick = (id) => (id === "casora_versions" ? (this._bOpen = true, this._cvFromMenu()) : pick(id));
        }
        // „…“: Einführung noch einmal ansehen.
        const h = items.findIndex((x) => x && x.id === "hints");
        if (h >= 0 && !items.some((x) => x && x.id === "bintro")) {
          items = items.slice();
          items.splice(h + 1, 0, { id: "bintro", label: "Quick tour", glyph: "tile", plainGlyph: true, group: items[h].group });
          const pick = onPick;
          onPick = (id) => (id === "bintro" ? setTimeout(() => this._bIntro(true), 60) : pick(id));
        }
        // Szenen: „Aus aktuellem Zustand“ (nur Admins) vor „Neue Szene in Home Assistant“.
        const n = items.findIndex((x) => x && x.id === "\u0000new");
        if (n >= 0 && this._hass && this._hass.user && this._hass.user.is_admin) {
          items = items.slice();
          items.splice(n, 0, { id: "\u0000state", label: "From the current state…", icon: "plus", group: items[n].group, quiet: true });
          const pick = onPick;
          onPick = (id) => (id === "\u0000state" ? this._bSceneFromState() : pick(id));
        }
      }
      return orig.call(this, anchor, items, onPick, mopts);
    });

    P._bRewindBtn = function () {
      const root = this.shadowRoot;
      const undo = root.getElementById("undo");
      if (!undo) return;
      let b = root.getElementById("brewind");
      if (!b) {
        b = document.createElement("button");
        b.id = "brewind";
        b.type = "button";
        b.className = "ghost icon";
        b.innerHTML = svg("clock", 2.1);
        b.setAttribute("aria-label", "Rewind");
        b.title = "Rewind – go back to an earlier saved state";
        b.onclick = () => { if (typeof this._cvFromMenu === "function") { this._bOpen = true; this._cvFromMenu(); } };
        undo.after(b);
      }
      b.classList.toggle("has", !!this._dashUrl && typeof this._cvFromMenu === "function" && !!this._state);
    };

    // ── Esc schließt Blätter (z. B. „Desktop und Handy angleichen“) ────
    P._bPlusKeys = function () {
      if (this._bPlusKeyed) return;
      this._bPlusKeyed = true;
      this.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape" || ev.defaultPrevented) return;
        const root = this.shadowRoot;
        if (root.querySelector(".bintro")) { ev.preventDefault(); return this._bIntroEnd(); }
        if (root.querySelector(".bsfs")) { ev.preventDefault(); return this._bSceneClose(); }
        if (this._flowMode === "sheet" && this._flowClosable && this._state
          && !root.querySelector(".askpane, .menu, .popmenu, [role=menu]")) {
          ev.preventDefault();
          ev.stopPropagation();
          this._flowBack();
        }
      }, true);
    };

    // ── Weiches Schließen des Inspektors (✕ und Abdunkelung) ──────────
    P._bCloseSoft = function () {
      const insp = this.shadowRoot.querySelector(".inspector");
      if (reduced() || !insp || !insp.getClientRects().length || !insp.animate) return this._bClose();
      if (this._bClosing) return undefined;
      this._bClosing = true;
      const phone = isPhone(this);
      const a = insp.animate([{ opacity: 1, transform: "none" },
        { opacity: 0, transform: phone ? "translateY(48px)" : this.classList.contains("bstack") ? "translateY(24px)" : "translateX(18px)" }],
      { duration: 170, easing: "cubic-bezier(.4,0,1,1)" });
      const done = () => { this._bClosing = false; this._bClose(); };
      a.finished.then(done, done);
      return undefined;
    };

    // ── Nach jedem Zeichnen ──────────────────────────────────────────
    wrap("_renderForm", (orig) => function () {
      const r = orig.apply(this, arguments);
      try { if (this.classList.contains("bmode")) this._bPlusDecorate(); } catch (e) { console.warn("Casora Studio:", e); }
      return r;
    });
    wrap("_bApply", (orig) => function () {
      const r = orig.apply(this, arguments);
      try {
        if (this.classList.contains("bmode")) {
          this._bPlusCss();
          this._bPlusKeys();
          this._bRewindBtn();
          const root = this.shadowRoot;
          const x = root.querySelector(".inspector > .bclose");
          if (x && !x._bSoft) { x._bSoft = true; x.onclick = () => this._bCloseSoft(); }
          if (!this._bIntroTried && this._state && on(this)) {
            this._bIntroTried = true;
            setTimeout(() => this._bIntro(false), 1400);
          }
          this._bWireSmartDrag();
        }
      } catch (e) { console.warn("Casora Studio:", e); }
      return r;
    });

    P._bPlusDecorate = function () {
      const root = this.shadowRoot;
      const pane = root.getElementById("pane");
      if (!pane) return;
      // Kachelliste: was die intelligente Sortierung tut, steht direkt am Schalter.
      const strip = pane.querySelector("#band-tiles .sortstrip");
      if (strip) {
        const sw = strip.querySelector(".sw");
        const note = strip.querySelector(".sortnote");
        const paint = () => {
          const onNow = !sw || sw.getAttribute("aria-checked") !== "false";
          if (note) note.textContent = tr(onNow ? "Active tiles move to the front in the preview, then your order"
            : "The preview shows your order");
          if (note) note.setAttribute("data-no-i18n", "");
        };
        paint();
        if (sw && !sw._bNote) { sw._bNote = true; sw.addEventListener("click", () => requestAnimationFrame(paint)); }
      }
      // Leere Kachelliste: sagen, was eine Kachel ist und wie es weitergeht.
      const room = room$(this);
      const add = pane.querySelector("#band-tiles .addbar.tileadd");
      const empty = pane.querySelector("#band-tiles .bempty");
      if (add && room && !(room.tiles || []).length) {
        if (!empty) {
          const e = document.createElement("div");
          e.className = "bempty";
          e.innerHTML = "<b></b><span></span>";
          e.querySelector("b").textContent = tr("No tiles in this room yet");
          e.querySelector("span").textContent = tr("Tiles show devices – a light, the heating or the TV. Add the first one below.");
          add.before(e);
        }
      } else if (empty) empty.remove();
      // Szenen: Name öffnet die Farbe; leer → nächster Schritt.
      const card = pane.querySelector('#band-rooms [data-k="Scenes"]');
      if (card) {
        card.querySelectorAll(".scenecolor:not(.hid)").forEach((row) => {
          const nm = row.querySelector(".scname"), pk = row.querySelector(".scpick");
          if (nm && pk && !nm._bWired) { nm._bWired = true; nm.onclick = () => pk.click(); }
        });
        const has = !!card.querySelector(".scenecolors");
        let se = card.querySelector(".bempty");
        if (!has && !se && (this._sceneCatalog ? !this._sceneCatalog().length : true)) {
          se = document.createElement("div");
          se.className = "bempty";
          se.innerHTML = "<b></b><span></span>";
          se.querySelector("b").textContent = tr("No scenes yet");
          const admin = !!(this._hass && this._hass.user && this._hass.user.is_admin);
          se.querySelector("span").textContent = tr(admin
            ? "Set the lights the way you like them, then save that as a scene – in one step."
            : "Scenes are created in Home Assistant by an administrator.");
          if (admin) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = tr("Save the current state as a scene");
            b.onclick = () => this._bSceneFromState();
            se.appendChild(b);
          }
          card.appendChild(se);
        } else if (has && se) se.remove();
      }
    };

    // Vorschau: wer bei eingeschalteter Sortierung eine Kachel zieht, erfährt warum nichts passiert.
    P._bWireSmartDrag = function () {
      const root = this.shadowRoot;
      if (this._bSmartWired || !root) return;
      this._bSmartWired = true;
      root.addEventListener("pointerdown", (ev) => {
        if (!on(this) || ev.button) return;
        const t = ev.target && ev.target.closest && ev.target.closest('.card.map .mtile[data-mk^="t:"]');
        if (!t || !(this._smartSortOn && this._smartSortOn())) return;
        const x0 = ev.clientX, y0 = ev.clientY;
        const move = (e) => {
          if (Math.hypot(e.clientX - x0, e.clientY - y0) < 12) return;
          off();
          if (ev.pointerType !== "touch") this._bSmartToast();
        };
        const off = () => { root.removeEventListener("pointermove", move); root.removeEventListener("pointerup", off); root.removeEventListener("pointercancel", off); };
        root.addEventListener("pointermove", move);
        root.addEventListener("pointerup", off);
        root.addEventListener("pointercancel", off);
      }, true);
      // Abdunkelung am Handy: weich schließen (der Knopf darunter wird wie bisher ausgelöst).
      const scrim = root.querySelector(".bscrim");
      if (scrim && scrim.onclick && !scrim._bSoft) {
        scrim._bSoft = true;
        const orig = scrim.onclick;
        scrim.onclick = (ev) => {
          scrim.style.pointerEvents = "none";
          const hit = root.elementFromPoint ? root.elementFromPoint(ev.clientX, ev.clientY) : null;
          scrim.style.pointerEvents = "";
          if (hit && hit.closest && hit.closest(".navpill button")) return orig.call(scrim, ev);
          this._bCloseSoft();
        };
      }
    };

    // ── Einführung (einmal, überspringbar) ───────────────────────────
    P._bIntro = function (force) {
      if (!force && ls(INTRO)) return;
      const root = this.shadowRoot;
      if (!on(this) || !this._state || root.querySelector(".bintro")) return;
      // Nicht über einen offenen Dialog, ein Menü oder das „Neu“-Fenster legen – später noch einmal.
      const busy = this._flowMode || root.querySelector(".askpane, .menu, [role=menu], .bsfs")
        || document.querySelector("casora-welcome, .casora-welcome");
      if (busy && !force) {
        this._bIntroTries = (this._bIntroTries || 0) + 1;
        if (this._bIntroTries < 6) setTimeout(() => this._bIntro(false), 2500);
        return;
      }
      this._bPlusCss();
      if (this._bOpen && isPhone(this)) this._bClose();
      const phone = isPhone(this);
      const vis = (sel) => [...root.querySelectorAll(sel)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; }) || null;
      const steps = [
        { at: () => vis(".stage .plinth") || vis(".card.map"),
          title: phone ? "Tap to edit" : "Click to edit",
          text: phone ? "Tap a title, badge or tile in the preview. Its settings open below."
            : "Click a title, badge or tile in the preview. Its settings open on the right." },
        { at: () => (phone ? vis(".bbar") : vis(".btools")),
          title: "Everything in one place",
          text: "Rooms, the list of all elements, the settings of this dashboard and the settings for all dashboards." },
        { at: () => vis(".navpill"),
          title: "Nothing gets lost",
          text: phone ? "Undo and Rewind are in the ··· menu. Done saves and opens your dashboard."
            : "Undo and Rewind (the clock) bring back any earlier state. Done saves and opens your dashboard." },
      ];
      const box = document.createElement("div");
      box.className = "bintro in";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.innerHTML = '<div class="bspot"></div><div class="bcoach"><div class="bstep" data-no-i18n></div><h3></h3><p></p>'
        + '<div class="bacts"><div class="bdots"><i></i><i></i><i></i></div><div>'
        + '<button type="button" class="bskip"></button><button type="button" class="bnext"></button></div></div></div>';
      box.setAttribute("aria-label", tr("Quick tour"));
      root.appendChild(box);
      const spot = box.querySelector(".bspot"), coach = box.querySelector(".bcoach");
      let i = 0;
      const show = () => {
        const s = steps[i];
        const el = s.at();
        const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
        const pad = 8;
        if (r) Object.assign(spot.style, { display: "", left: (r.left - pad) + "px", top: (r.top - pad) + "px",
          width: (r.width + 2 * pad) + "px", height: (r.height + 2 * pad) + "px" });
        else spot.style.display = "none";
        box.querySelector(".bstep").textContent = (i + 1) + " / " + steps.length;
        box.querySelector("h3").textContent = tr(s.title);
        box.querySelector("p").textContent = tr(s.text);
        box.querySelectorAll(".bdots i").forEach((d, k) => d.classList.toggle("on", k === i));
        box.querySelector(".bskip").textContent = tr("Skip");
        box.querySelector(".bskip").style.visibility = i === steps.length - 1 ? "hidden" : "";
        box.querySelector(".bnext").textContent = tr(i === steps.length - 1 ? "Got it" : "Next");
        // Karte neben das Element: darunter, sonst darüber, sonst links daneben (Inspektor-Seite frei).
        const vw = window.innerWidth, vh = window.innerHeight;
        const cw = coach.offsetWidth || 320, ch = coach.offsetHeight || 170;
        let left = 16, top = vh - ch - 16;
        if (r) {
          left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
          if (r.bottom + pad + 14 + ch < vh - 8) top = r.bottom + pad + 14;
          else if (r.top - pad - 14 - ch > 8) top = r.top - pad - 14 - ch;
          else { top = Math.max(16, Math.min(vh - ch - 16, r.top + r.height / 2 - ch / 2)); left = Math.max(16, r.left + 24); }
        }
        coach.style.left = Math.round(left) + "px";
        coach.style.top = Math.round(top) + "px";
        box.querySelector(".bnext").focus({ preventScroll: true });
      };
      box.querySelector(".bskip").onclick = () => this._bIntroEnd();
      box.querySelector(".bnext").onclick = () => { if (++i >= steps.length) this._bIntroEnd(); else show(); };
      box.addEventListener("click", (ev) => { if (ev.target === box) ev.stopPropagation(); });
      show();
      requestAnimationFrame(show);
    };
    P._bIntroEnd = function () {
      ls(INTRO, "1");
      const box = this.shadowRoot.querySelector(".bintro");
      if (!box) return;
      if (reduced() || !box.animate) return box.remove();
      box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease" }).finished.then(() => box.remove(), () => box.remove());
    };

    // ── Szene aus dem jetzigen Zustand ───────────────────────────────
    P._bSceneClose = function () {
      const el = this.shadowRoot.querySelector(".bsfs");
      if (!el) return;
      const back = this._bSceneFrom;
      this._bSceneFrom = null;
      const done = () => { el.remove(); if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); };
      if (reduced() || !el.animate) return done();
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease" }).finished.then(done, done);
    };

    P._bSceneFromState = function () {
      const H = this._hass;
      if (!H || !(H.user && H.user.is_admin)) return;
      this._bPlusCss();
      const root = this.shadowRoot;
      if (root.querySelector(".bsfs")) return;
      this._bSceneFrom = root.activeElement;
      const SF = W.casoraSceneFromState;
      const room = room$(this);
      const A = H.areas || {};
      const areaIds = Object.keys(A).sort((x, y) => String(A[x].name || x).localeCompare(String(A[y].name || y)));
      let area = (room && this._roomArea && this._roomArea(room)) || "";
      if (!A[area]) area = areaIds.find((a) => SF.areaEntities(H, a).length) || areaIds[0] || "";
      const lang = (H.locale && H.locale.language) || H.language || "en";
      const unit = (H.config && H.config.unit_system && H.config.unit_system.temperature) || "°C";
      const el = document.createElement("div");
      el.className = "bsfs";
      el.innerHTML = '<div class="bsscrim"></div><div class="bscard" role="dialog" aria-modal="true">'
        + '<div class="bshead"><h2></h2><p class="bslede"></p></div>'
        + '<div class="bsform"><label class="bsl"><span class="bslname"></span><input type="text" class="bsin" autocomplete="off" maxlength="60"></label>'
        + '<label class="bsl"><span class="bslroom"></span><select class="bsroom"></select></label></div>'
        + '<div class="bslisthead"><span class="bslcount" data-no-i18n></span><button type="button" class="bsall"></button></div>'
        + '<div class="bslist" role="group"></div><div class="bserr" hidden></div>'
        + '<div class="bsfoot"><button type="button" class="bsno"></button><button type="button" class="bsgo" disabled></button></div></div>';
      const $ = (s) => el.querySelector(s);
      $("h2").textContent = tr("Save the current state as a scene");
      $(".bscard").setAttribute("aria-label", tr("Save the current state as a scene"));
      $(".bslede").textContent = tr("Casora remembers how these devices are set right now. Later, the scene sets them back exactly like this.");
      $(".bslname").textContent = tr("Name");
      $(".bsin").placeholder = tr("e.g. Movie night");
      $(".bslroom").textContent = tr("Room");
      $(".bsno").textContent = tr("Cancel");
      $(".bsgo").textContent = tr("Save scene");
      const sel = $(".bsroom");
      areaIds.forEach((a) => { const o = document.createElement("option"); o.value = a; o.textContent = A[a].name || a; sel.appendChild(o); });
      sel.value = area;
      sel.setAttribute("data-no-i18n", "");
      let checked = new Set();
      const list = $(".bslist");
      const paintCount = () => {
        const n = checked.size;
        $(".bslcount").textContent = n === 1 ? tr("1 device") : tr("{n} devices").replace("{n}", n);
        const all = SF.areaEntities(H, sel.value);
        $(".bsall").textContent = tr(n === all.length && n ? "None" : "All");
        $(".bsall").hidden = !all.length;
        $(".bsgo").disabled = !n || !$(".bsin").value.trim();
      };
      const paintList = () => {
        const S = H.states || {};
        const ids = SF.areaEntities(H, sel.value);
        checked = new Set(ids.filter(SF.checkedByDefault));
        list.innerHTML = "";
        if (!ids.length) {
          const e = document.createElement("div");
          e.className = "bsnone";
          e.textContent = tr("No lights, blinds or other devices for scenes in this room.");
          list.appendChild(e);
        }
        ids.forEach((id) => {
          const so = S[id];
          const d = id.split(".")[0];
          const row = document.createElement("label");
          row.className = "bsrow";
          const lit = /^(on|open|playing|heat|cool|auto|heat_cool)$/.test(String(so.state));
          row.classList.toggle("lit", lit && d === "light");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = checked.has(id);
          cb.onchange = () => { if (cb.checked) checked.add(id); else checked.delete(id); paintCount(); };
          const ic = document.createElement("ha-icon");
          const own = so.attributes && so.attributes.icon;
          ic.setAttribute("icon", own && /^mdi:/.test(own) ? own : (DOMAIN_ICON[d] || ["mdi:circle"])[lit ? 0 : 1] || "mdi:circle");
          const nm = document.createElement("span");
          nm.className = "bsname";
          nm.setAttribute("data-no-i18n", "");
          const b = document.createElement("b");
          b.textContent = (so.attributes && so.attributes.friendly_name) || id;
          const s = document.createElement("span");
          s.textContent = SF.describe(so, tr, lang, unit);
          nm.appendChild(b); nm.appendChild(s);
          row.appendChild(cb); row.appendChild(ic); row.appendChild(nm);
          list.appendChild(row);
        });
        paintCount();
      };
      sel.onchange = paintList;
      $(".bsin").oninput = paintCount;
      $(".bsin").onkeydown = (ev) => { if (ev.key === "Enter" && !$(".bsgo").disabled) $(".bsgo").click(); };
      $(".bsall").onclick = () => {
        const all = SF.areaEntities(H, sel.value);
        const none = checked.size === all.length;
        checked = new Set(none ? [] : all);
        list.querySelectorAll(".bsrow input").forEach((cb, k) => { cb.checked = checked.has(all[k]); });
        paintCount();
      };
      $(".bsno").onclick = () => this._bSceneClose();
      $(".bsscrim").onclick = () => this._bSceneClose();
      $(".bsgo").onclick = async () => {
        const name = $(".bsin").value.trim();
        if (!name || !checked.size) return;
        $(".bsgo").disabled = true;
        $(".bserr").hidden = true;
        const ids = SF.areaEntities(H, sel.value).filter((id) => checked.has(id));
        const cfg = SF.buildScene(name, ids, this._hass.states);
        try {
          await this._hass.callApi("POST", "config/scene/config/" + cfg.id, cfg);
        } catch (e) {
          $(".bserr").textContent = tr("The scene could not be saved.") + " " + ((e && (e.body && e.body.message || e.message)) || "");
          $(".bserr").hidden = false;
          $(".bsgo").disabled = false;
          return;
        }
        this._bSceneClose();
        this._bSceneCreated(cfg);
      };
      root.appendChild(el);
      paintList();
      requestAnimationFrame(() => $(".bsin").focus({ preventScroll: true }));
    };

    // Neue Szene: warten, bis HA sie geladen hat, dann in der Liste zeigen und die Farbe wählen lassen.
    P._bSceneCreated = async function (cfg) {
      const find = () => {
        const S = (this._hass && this._hass.states) || {}, R = (this._hass && this._hass.entities) || {};
        return Object.keys(S).find((id) => id.startsWith("scene.") && R[id] && String((S[id].attributes || {}).id) === cfg.id) || null;
      };
      let id = find();
      for (let k = 0; !id && k < 40; k++) { await new Promise((r) => setTimeout(r, 200)); id = find(); }
      const undo = { label: tr("Undo"), run: async () => {
        try { await this._hass.callApi("DELETE", "config/scene/config/" + cfg.id); this._bToast(tr("Scene deleted")); } catch (e) { /* bleibt */ }
        if (this._state) this._renderForm();
      } };
      this._bToast(tr("Scene saved") + ": " + cfg.name, { action: undo, sub: tr("Saved in Home Assistant. Pick a color now.") });
      if (!id || !this._state) return;
      // Eigene Reihenfolge oder ausgeblendete Szenen: die neue gehört sichtbar dazu.
      const rooms = this._state.compact.rooms;
      let touched = false;
      rooms.forEach((r) => {
        const rv = r.variables || (r.variables = {});
        if (Array.isArray(rv.scene_order) && rv.scene_order.length && rv.scene_order.indexOf(id) < 0) { rv.scene_order = rv.scene_order.concat([id]); touched = true; }
        if (Array.isArray(rv.scene_exclude) && rv.scene_exclude.indexOf(id) >= 0) { rv.scene_exclude = rv.scene_exclude.filter((x) => x !== id); touched = true; }
        if (Array.isArray(rv.scenes) && rv.scenes.length && rv.scenes.indexOf(id) < 0) { rv.scenes = rv.scenes.concat([id]); touched = true; }
      });
      if (touched) { this._bQuiet = true; try { this._markDirty(); } finally { this._bQuiet = false; } }
      this._bOpen = true;
      this._select({ group: "rooms", key: "Scenes", label: "Scenes" });
      setTimeout(() => {
        const row = this.shadowRoot.querySelector('#pane .scenecolor[data-id="' + id + '"]');
        if (!row) return;
        reveal(row, this.shadowRoot.querySelector(".inspector"));
        row.classList.add("bflash");
        setTimeout(() => row.classList.remove("bflash"), 1800);
        const pk = row.querySelector(".scpick");
        if (pk) setTimeout(() => pk.click(), 380);
        if (this._syncPreview) this._syncPreview();
      }, 420);
    };
  });
})();
