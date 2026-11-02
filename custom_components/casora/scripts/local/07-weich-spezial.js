// ── Soft look of the special popups (01.10.2026) ────────────────────────────
// Camera (casora_popup_camera), media and the alarm switch in the soft design: ring head, sand pills, labels,
// round bars and buttons. Only active when the theme sets --casora-popup-layout: soft
// (window._casoraSoft); standard and glass keep building their previous HTML.
// The templates only call window._casoraCamSoft / _casoraMediaSoft / _casoraAlarmSoftToggle.
// (Aquarium overview and aquarium light: removed on 01.10.2026, the tank popup replaces them.)
(function () {
  if (window._casoraWeichSpezial) return;
  window._casoraWeichSpezial = true;

  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var FONT = 'var(--primary-font-family, system-ui)';
  var INK = 'var(--casora-popup-tiles-text-primary, #3A322B)';
  var SUB = 'var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary))';
  var ROW = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))';
  var CTL = 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))';

  // ── Media (casora_media, casora_now_playing_chip/_primary) ─────────────────
  // Extra rules after the media popup's own <style> (soft only):
  // label, large round cover corner, round progress and volume bars,
  // sand circles for the buttons, play button in colour, sources as sand pills.
  // Fix round 1: media = blue (fixed colour mapping), via --casora-soft-media-hue.
  var MEDIA_HUE = 'var(--casora-soft-media-hue, var(--casora-soft-media, var(--casora-color-pink, #D16E7E)))';
  /* 1.2 (P6): play button, progress and volume in the media popup in the tile's media colour (pink). */
  var MEDIA_ACC = 'var(--casora-tile-media-color, ' + MEDIA_HUE + ')';
  var srcRules = function () {
    return '.hm-src-l{font-size:var(--casora-h15-fs,17px) !important;font-weight:700 !important;letter-spacing:-0.01em !important;text-transform:none;'
      + 'color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary)) !important;margin:24px 6px 10px !important;}'
      + '.hm-src .hui-sg{font-size:13px !important;font-weight:600 !important;padding:11px 16px !important;'
      + 'background:var(--casora-lps-chip, ' + ROW + ') !important;color:var(--casora-lps-chip-ink, ' + SUB + ') !important;}'
      + '.hm-src .hui-sg.on{background:var(--casora-lps-chip-on, ' + CTL + ') !important;color:var(--casora-lps-chip-on-ink, ' + INK + ') !important;}';
  };
  // Play button in the cover's colour (owner 26.10.2026), the same colour the wave's rows take from the cover
  // (_casoraNPSoft.tintOf, 09-weich-wiedergabe.js). Icon dark on a light colour, white on a dark one.
  var lumOf = function (col) {
    var m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(col || '');
    if (!m) return 0;
    var h = +m[1] / 360, sa = +m[2] / 100, l = +m[3] / 100;
    var q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, pp = 2 * l - q;
    var ch = function (t) { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t; var v = t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(h + 1 / 3) + 0.7152 * ch(h) + 0.0722 * ch(h - 1 / 3);
  };
  // One accent from the cover for the whole player (owner 01.11.2026): the dial's ring (--casora-popup-accent on the
  // stage), the progress fill, its knob's glow and the play button (--hm-acc). Before, only the play button took the
  // cover's colour and ring and bar kept the fixed media pink. The play icon stays white while it keeps 3 : 1 on the
  // colour (WCAG non-text contrast: relative luminance up to 0.3), else it turns dark.
  var tintRule = function (col) {
    if (!col) return '';
    return '.hui-stage{--casora-popup-accent:' + col + ';}.hm-wrap{--hm-acc:' + col + ';}'
      + (lumOf(col) > 0.3 ? '.hm-b.lg > div{background-color:var(--casora-popup-ui-on-ink, #000) !important;}' : '');
  };
  // While the cover is still being read: a placeholder <style> that is filled in once the colour is known.
  var tintWait = function (url) {
    var n = 0;
    var tick = function () {
      var M = window._casoraNPSoft, col = M && M.tintOf ? M.tintOf(url) : '';
      if (col === null && ++n < 40) { setTimeout(tick, 150); return; }
      var s = window.casoraPopup && window.casoraPopup.surface;
      if (!s || !col) return;
      (function walk(root) {
        root.querySelectorAll('style[data-hm-tint]').forEach(function (st) { if (st.getAttribute('data-hm-tint') === url) st.textContent = tintRule(col); });
        root.querySelectorAll('*').forEach(function (el) { if (el.shadowRoot) walk(el.shadowRoot); });
      })(s);
    };
    setTimeout(tick, 150);
  };
  var tintCss = function (pic) {
    var M = window._casoraNPSoft;
    if (!pic || !M || !M.tintOf) return '';
    var col = M.tintOf(pic);
    if (col === null) { tintWait(pic); return '<style data-hm-tint="' + esc(pic) + '"></style>'; }
    return col ? '<style>' + tintRule(col) + '</style>' : '';
  };
  window._casoraMediaSoft = {
    srcRules: srcRules,
    // pic: the cover being shown (null without one) – tints the play button.
    css: function (pic) {
      return '<style>'
        /* Fix round 1 (B-01/B-04): room as the status line under the title, the track's title 17/700. */
        + '.hm-lbl{font-size:15px;font-weight:500;letter-spacing:0;text-transform:none;line-height:1.35;overflow:visible;color:' + SUB + ';margin:-2px 0 20px;}'
        + '.hm-art{border-radius:28px;background:' + CTL + ';box-shadow:var(--casora-soft-art-shadow, 0 18px 40px -22px rgba(90,70,50,0.45));}'
        + '.hm-art::after{box-shadow:none;}'
        + '.hm-t{font-size:17px;font-weight:700;letter-spacing:-0.01em;}'
        + '.hm-s{font-weight:500;color:' + SUB + ';}'
        + '.hm-prog{margin-top:18px;}'
        + '.hm-track{height:8px;background:' + CTL + ';}'
        /* Progress like the play button in the media colour (P6). */
        /* One accent for bar, knob glow and play button: the media colour, in v3 the dial's (the cover's once read). */
        + '.hm-wrap{--hm-acc:' + MEDIA_ACC + ';}.hui-stage .hm-wrap{--hm-acc:var(--casora-popup-accent, ' + MEDIA_ACC + ');}'
        + '.hm-fill{background:var(--hm-acc);}'
        + '.hm-times{font-weight:600;color:' + SUB + ';margin-top:7px;}'
        + '.hm-ctl{gap:22px;margin-top:18px;}'
        + '.hm-b.sm{width:56px;height:56px;background:' + CTL + ';}'
        + '.hm-b.sm > div{transform:scale(.72);}'
        /* No glow: the card's body clips everything below the button, the glow ended in a hard edge (26.10.2026);
           flat like the other main buttons. */
        + '.hm-b.lg{width:72px;height:72px;background:var(--hm-acc);box-shadow:none;}'
        + '.hm-b.lg > div{background-color:#fff !important;}'
        + '@media (hover:hover){.hm-b.sm:hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
        + '.hm-vol{min-height:66px;margin-top:24px;padding:8px 12px 8px 10px;border-radius:999px;background:' + ROW + ';color:' + SUB + ';}'
        + '.hm-vol .hm-b{width:44px;height:44px;background:' + CTL + ';}'
        + '.hm-vol .hm-track{height:10px;}'
        /* Volume like the progress (P6). */
        + '.hm-vol .hm-fill{background:var(--hm-acc);}'
        + '.hm-vol .pct{font-size:14px;font-weight:700;color:' + INK + ';min-width:44px;}'
        + srcRules()
        /* Low landscape (iPad 1024×768): smaller cover, so keys and volume stay visible without
           scrolling – before, the volume lay below the edge while playing (07.10.2026). */
        + '@media (min-width:761px) and (max-height:900px){.hm-art{width:min(240px, max(120px, calc(100vh - 640px)));}}'
        + '</style>' + tintCss(pic);
    },
  };

  // ── Alarm popup: controls (06.10.2026, soft only) ──────────────────────────
  // Instead of an on/off switch: a large main button (arm/disarm/cancel/end alarm) + mode rows
  // below. Code field when Alarmo asks for a code (code_format /
  // code_arm_required), countdown for arming/pending from Alarmo's delay attribute, a hint when triggered.
  // The template calls _casoraAlarmSoftToggle (field „toggle“) and _casoraSoftAlarm (field „modes“).
  var AL = window._casoraAlarmSoft = {};
  // The countdown number runs in CSS (registered integer property) – no timer needed.
  try { if (window.CSS && CSS.registerProperty) CSS.registerProperty({ name: '--cal-n', syntax: '<integer>', inherits: true, initialValue: '0' }); } catch (e) { /* already registered */ }
  var FEAT = { armed_home: 1, armed_away: 2, armed_night: 4, armed_custom_bypass: 16, armed_vacation: 32 };
  var MODE_WORD = { armed_home: 'Zuhause', armed_away: 'Abwesend', armed_night: 'Nacht', armed_vacation: 'Urlaub', armed_custom_bypass: 'Bypass' };
  var GOOD = 'var(--casora-security-ok-color, var(--casora-color-green, #5E9E6E))';
  var WARN = 'var(--casora-security-warn-color, var(--casora-color-orange, #DE8A4E))';
  var BAD = 'var(--casora-security-alarm-color, var(--casora-color-red, #D35A4E))';
  var TON = 'var(--casora-ton-ink, #94603B)';
  var icon = function (name, size, color) {
    var u = (typeof window.casoraIconUrl === 'function') ? window.casoraIconUrl(name) : '';
    return '<span style="display:inline-block;flex:none;width:' + esc(size) + 'px;height:' + esc(size) + 'px;background-color:' + esc(color) + ';'
      + "-webkit-mask:url('" + u + "') center / contain no-repeat;mask:url('" + u + "') center / contain no-repeat;pointer-events:none;\"></span>";
  };
  AL.info = function (ent, states) {
    var so = states[ent] || {}, a = so.attributes || {};
    var st = so.state || 'unknown';
    var feat = typeof a.supported_features === 'number' ? a.supported_features : 63;
    var needArm = !!a.code_format && a.code_arm_required !== false;
    var needDis = !!a.code_format;
    var left = null;
    if ((st === 'arming' || st === 'pending') && Number(a.delay) > 0 && so.last_changed) {
      left = Math.max(0, Math.round(Number(a.delay) - (Date.now() - new Date(so.last_changed).getTime()) / 1000));
    }
    var target = MODE_WORD[a.next_state] || MODE_WORD[a.arm_mode] || null;
    return { st: st, a: a, feat: feat, needArm: needArm, needDis: needDis, left: left, total: Number(a.delay) || 0, target: target,
      armed: !!MODE_WORD[st], numeric: a.code_format === 'number' };
  };
  AL.ok = function (I, id) { return !FEAT[id] || (I.feat & FEAT[id]) === FEAT[id]; };
  // Control: data-casora-alarm instead of data-casora-svc – the code from the field is added on the tap.
  AL.act = function (ent, service) {
    return ' role="button" tabindex="0" data-casora-alarm="' + esc(JSON.stringify({ e: ent, s: service })) + '"';
  };
  // Two shapes arrive: {e, s} from the main button and {domain, service, data:{entity_id}} from the
  // mode rows (UI.group, only the attribute renamed). Without aligning them the mode rows had no service.
  AL.spec = function (sp) {
    if (!sp || typeof sp !== 'object') return null;
    var s = sp.s || sp.service, e = sp.e || (sp.data && sp.data.entity_id) || (sp.target && sp.target.entity_id);
    if (Array.isArray(e)) e = e[0];
    return s && e ? { e: e, s: s } : null;
  };
  // Code field (only when the next action needs a code).
  AL.code = function (I) {
    var need = I.st === 'disarmed' ? I.needArm : I.needDis;
    if (!need) return '';
    return '<style>.cal-code input::placeholder{letter-spacing:0;font-weight:500;font-size:15px;color:' + SUB + ';}</style>'
      + '<div class="cal-code" style="display:flex;justify-content:center;margin:0 0 12px;">'
      + '<input type="password" autocomplete="off" ' + (I.numeric ? 'inputmode="numeric" pattern="[0-9]*" ' : '') + 'placeholder="Code eingeben" aria-label="Code"'
      + ' ontouchstart="event.stopPropagation();" ontouchend="event.stopPropagation();if(this.getRootNode().activeElement!==this){this.focus();}"'
      + ' onclick="event.stopPropagation();" onkeydown="event.stopPropagation();" onkeyup="event.stopPropagation();" onkeypress="event.stopPropagation();"'
      + ' style="width:220px;height:48px;box-sizing:border-box;border:none;outline:none;border-radius:999px;text-align:center;'
      + 'font:600 18px/1 ' + FONT + ';letter-spacing:.3em;color:' + INK + ';background:' + CTL + ';-webkit-appearance:none;appearance:none;"></div>';
  };
  // Countdown bar + number (arming = until armed, pending = until the alarm).
  AL.count = function (I, color) {
    if (I.left == null) return { bar: '', n: '' };
    var pct = I.total ? Math.max(0, Math.min(100, 100 - I.left / I.total * 100)) : 0;
    var k = 'cal' + Date.now().toString(36);
    return {
      bar: '<style>@keyframes ' + k + 'w{from{width:' + pct.toFixed(1) + '%}to{width:100%}}@keyframes ' + k + 'n{from{--cal-n:' + I.left + '}to{--cal-n:0}}'
        + '.cal-n::after{counter-reset:caln var(--cal-n);content:counter(caln);}</style>'
        + '<div style="height:6px;border-radius:3px;background:' + CTL + ';overflow:hidden;margin-top:10px;">'
        + '<div style="height:100%;border-radius:3px;background:' + esc(color) + ';animation:' + k + 'w ' + I.left + 's linear forwards;"></div></div>',
      n: '<span class="cal-n" style="font-variant-numeric:tabular-nums;animation:' + k + 'n ' + I.left + 's steps(' + Math.max(1, I.left) + ', end) forwards;"></span>',
    };
  };
  // Field „toggle“ (top, centred)
  window._casoraAlarmSoftToggle = function (ent, states) {
    var I = AL.info(ent, states);
    var away = AL.ok(I, 'armed_away') ? 'armed_away' : (Object.keys(FEAT).filter(function (k) { return AL.ok(I, k); })[0] || 'armed_away');
    var cd = AL.count(I, '#fff');
    var b;
    if (I.st === 'disarmed') b = { svc: 'alarm_' + away.replace('armed_', 'arm_'), bg: TON, ink: '#fff', ic: 'shield_lock', t: 'Scharf schalten', s: MODE_WORD[away] };
    else if (I.st === 'triggered') b = { svc: 'alarm_disarm', bg: BAD, ink: '#fff', ic: 'shield_alarm', t: 'Alarm beenden', s: 'Die Alarmanlage wurde ausgelöst' };
    else if (I.st === 'arming') b = { svc: 'alarm_disarm', bg: TON, ink: '#fff', ic: 'shield_off', t: 'Abbrechen',
      s: (I.target ? I.target + ' · ' : '') + (cd.n ? 'scharf in ' + cd.n + ' s' : 'wird scharf …'), bar: true };
    else if (I.st === 'pending') b = { svc: 'alarm_disarm', bg: WARN, ink: '#fff', ic: 'shield_off', t: 'Unscharf schalten',
      s: cd.n ? 'Alarm in ' + cd.n + ' s' : 'Alarm läuft an', bar: true };
    else b = { svc: 'alarm_disarm', bg: CTL, ink: INK, ic: 'shield_off', t: 'Unscharf schalten', s: null };
    var bar = b.bar && cd.bar ? cd.bar.replace('background:' + CTL, 'background:rgba(255,255,255,0.28)').replace('margin-top:10px', 'margin-top:8px') : '';
    return '<div>' + AL.code(I) + '<div style="display:flex;justify-content:center;"><div' + AL.act(ent, b.svc)
      + ' style="display:flex;align-items:center;gap:14px;width:340px;max-width:100%;min-height:64px;box-sizing:border-box;padding:10px 22px 10px 16px;'
      + 'border-radius:999px;background:' + b.bg + ';color:' + b.ink + ';font-family:' + FONT + ';text-align:left;cursor:pointer;'
      + (b.bg === CTL ? '' : 'box-shadow:0 12px 26px -14px rgba(90,60,40,0.55);') + '">'
      + '<div style="width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;background:' + (b.bg === CTL ? 'var(--casora-lps-seg-on, #FFFDF9)' : 'rgba(255,255,255,0.2)') + ';">'
      /* Symbol on the light circle (seg-on) with its ink token: INK is light in the dark design and
         vanished there on the cream circle (design audit 10.10.2026). */
      + icon(b.ic, 22, b.bg === CTL ? 'var(--casora-lps-seg-on-ink, #2E2721)' : '#fff') + '</div>'
      + '<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:700;letter-spacing:-0.01em;">' + b.t + '</div>'
      + (b.s ? '<div style="font-size:13px;font-weight:600;opacity:.82;margin-top:1px;">' + b.s + '</div>' : '')
      + bar + '</div></div></div></div>';
  };

  // Field „modes“ (bottom, full width)
  window._casoraAlarmSoft.modes = function (ent, modes, states) {
    var UI = window._casoraUI; if (!UI) return '';
    var I = AL.info(ent, states);
    var list = modes.filter(function (m) { return AL.ok(I, m.id); });
    var aim = (I.st === 'arming' || I.st === 'pending') ? (I.a.next_state || I.a.arm_mode) : I.st;
    var svcOf = function (id) { return id === 'disarmed' ? 'alarm_disarm' : 'alarm_' + id.replace('armed_', 'arm_'); };
    var swap = function (html) { return String(html).replace(/data-casora-svc="/g, 'data-casora-alarm="'); };
    return swap(UI.group(list.map(function (m) {
      var on = aim === m.id;
      return { icon: m.icon, iconTone: on ? (m.id === 'disarmed' ? 'rgba(0,0,0,0)' : 'good') : 'rgba(0,0,0,0)', label: m.label,
        sub: on && (I.st === 'arming' || I.st === 'pending') ? 'Wird scharf …' : m.description,
        selected: on, svc: { domain: 'alarm_control_panel', service: svcOf(m.id), data: { entity_id: ent } } };
    }), I.st === 'disarmed' ? 'Oder Modus wählen' : 'Modus'));
  };

  // Popup v3 (richtlinien §4 S7, §5): field „stage“ – the state as the sentence in its level colour, open sensors as a
  // fact, the code field and countdown under it; one main action as the pill: arm (filled), disarm / end the alarm
  // unfilled with a question first. Taps go through data-casora-alarm (code from the field), as the old button.
  var SVC_SWAP = function (html) { return String(html).replace(/data-casora-svc="/g, 'data-casora-alarm="'); };
  AL.stage = function (ent, states) {
    var UI = window._casoraUI; if (!UI || !UI.stage) return '';
    var I = AL.info(ent, states), st = I.st;
    var na = st === 'unavailable' || st === 'unknown';
    var away = AL.ok(I, 'armed_away') ? 'armed_away' : (Object.keys(FEAT).filter(function (k) { return AL.ok(I, k); })[0] || 'armed_away');
    // The popup says „Aktiviert“ (word list §2, review 2 DD-16); the tile keeps its short „Aktiv · …“.
    var word = (window.casoraSecurityWord && String(window.casoraSecurityWord(ent, st) || '').replace(/^Aktiv · /, 'Aktiviert · '))
      || { arming: 'Wird scharf …', pending: 'Alarm läuft an', disarming: 'Wird unscharf geschaltet' }[st] || (na ? 'Nicht verfügbar' : 'Unbekannt');
    var open = I.a.open_sensors ? Object.keys(I.a.open_sensors).length : 0;
    var svc = function (service) { return { domain: 'alarm_control_panel', service: service, data: { entity_id: ent } }; };
    var act = null;
    if (st === 'disarmed') act = { text: 'Scharf schalten', sub: MODE_WORD[away], icon: 'mdi:shield-lock-outline', primary: true, svc: svc('alarm_' + away.replace('armed_', 'arm_')) };
    else if (st === 'triggered') act = { text: 'Alarm beenden', icon: 'mdi:shield-off-outline', danger: true, confirm: 'Alarm beenden?', svc: svc('alarm_disarm') };
    else if (st === 'arming') act = { text: 'Abbrechen', icon: 'mdi:close', svc: svc('alarm_disarm') };
    else if (st === 'pending') act = { text: 'Unscharf schalten', icon: 'mdi:shield-off-outline', svc: svc('alarm_disarm') };
    else if (I.armed) act = { text: 'Unscharf schalten', icon: 'mdi:shield-off-outline', danger: true, confirm: 'Alarmanlage unscharf schalten?', svc: svc('alarm_disarm') };
    var cd = AL.count(I, st === 'pending' ? WARN : TON);
    return SVC_SWAP(UI.stage('status', {
      tone: na ? 'off' : st === 'triggered' ? 'bad' : I.armed ? 'good' : 'warn', state: na ? 'na' : null,
      icon: st === 'triggered' ? 'shield_alarm' : I.armed ? 'shield_lock' : 'shield_off',
      text: word,
      facts: open ? [{ label: open === 1 ? 'Sensor offen' : 'Sensoren offen', value: String(open) }] : [],
      action: na ? null : act,
      extra: na ? '' : (cd.bar || '') + AL.code(I),
      // Dial (richtlinien §4.8): Abwesend · Zuhause · Nacht as moons; „Unscharf schalten“ (dangerous) is the unfilled
      // pill under the wheel with a question, never a moon.
      moons: function () { return AL.quick(ent, states); },
    }));
  };
  // Status line (richtlinien §3, owner 01.11.2026): never the stage's sentence again („Aktiviert · Zuhause“ stood in the
  // head and in the wheel) – the head says since when: „Seit 14:42“ today, else „Seit 28.10.“.
  AL.since = function (iso, now) {
    var t = iso ? new Date(iso) : null;
    if (!t || isNaN(t.getTime())) return '';
    var n = now || new Date(), loc = window.casoraLocale ? window.casoraLocale() : 'de-DE';
    var same = t.toDateString() === n.toDateString();
    return 'Seit ' + (same ? t.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
      : t.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }));
  };
  AL.line = function (ent, states) {
    var UI = window._casoraUI, s = states && states[ent];
    if (!UI || !UI.line || !s) return '';
    // issue 106: the same time the other popups say (casoraSinceMs: nothing after HA's start). An alarm unchanged since
    // HA's start still says its last_changed: the head's fallback word („Aktiviert · Zuhause“) repeats the wheel and is
    // dropped (§3), so without this line the alarm and security heads stood empty (gate 02.11.2026, r105 DP-11).
    var ms = window.casoraSinceMs ? window.casoraSinceMs(s) : null;
    var w = AL.since(ms != null ? ms : s.last_changed);
    return w ? UI.line(w, []) : '';
  };
  // Field „quick“: every arm mode the panel supports (supported_features: away, home, night, vacation, custom bypass) –
  // up to 4 as moons, more: the first 3 and „Alle (n)“ → a sub page with every mode (richtlinien §5, owner 01.11.2026:
  // Urlaub and Bypass were missing). „Aus“ is the stage's action only (the pill under the wheel).
  var ARM_ORDER = ['armed_away', 'armed_home', 'armed_night', 'armed_vacation', 'armed_custom_bypass'];
  var ARM_ICON = { armed_away: 'shield_lock', armed_home: 'shield_check', armed_night: 'shield_moon',
    armed_vacation: 'mdi:airplane', armed_custom_bypass: 'mdi:shield-edit-outline' };
  AL.armModes = function (I) { return ARM_ORDER.filter(function (id) { return AL.ok(I, id); }); };
  AL.quick = function (ent, states) {
    var UI = window._casoraUI; if (!UI || !UI.quick) return '';
    var I = AL.info(ent, states);
    if (I.st === 'unavailable' || I.st === 'unknown') return '';
    var aim = (I.st === 'arming' || I.st === 'pending') ? (I.a.next_state || I.a.arm_mode) : I.st;
    var ids = AL.armModes(I);
    if (ids.length > 4) regModes();
    return SVC_SWAP(UI.quick(ids.map(function (id) {
      return { icon: ARM_ICON[id], text: MODE_WORD[id], active: aim === id,
        svc: { domain: 'alarm_control_panel', service: 'alarm_' + id.replace('armed_', 'arm_'), data: { entity_id: ent } } };
    }), null, { page: 'alarmModes|' + ent }));
  };
  // Sub page „Modus“: every supported arm mode as a row (the chosen one marked), taps through data-casora-alarm.
  var regModes = function () {
    if (AL._pg || !window._casoraUI || !window._casoraUI.page) return;
    AL._pg = true;
    window._casoraUI.page('alarmModes', function (ent) {
      var HH = window._casoraHH; if (!HH || !HH.page || !ent) return;
      HH.page('Modus', [ent], 'const A = window._casoraAlarmSoft, E = ' + JSON.stringify(ent) + ';\n'
        + 'return A && A.modeRows ? A.modeRows(E, states) : "";', ent);
    });
  };
  window._casoraAlarmSoft.modeRows = function (ent, states) {
    var I = AL.info(ent, states);
    return window._casoraAlarmSoft.modes(ent, AL.armModes(I).map(function (id) {
      return { id: id, icon: { armed_away: 'mdi:shield-lock-outline', armed_home: 'mdi:shield-home-outline', armed_night: 'mdi:shield-moon-outline' }[id] || ARM_ICON[id],
        label: MODE_WORD[id] };
    }), states);
  };

  // Popup v3: a dangerous main action asks first (confirm as in the shared services). Code missing: shake the field
  // first (run does it), ask only once a code is there. true = handled here.
  AL.ask = function (spec, el, ask, run) {
    var ha0 = document.querySelector('home-assistant'), I0 = ha0 && ha0.hass ? AL.info(spec.e, ha0.hass.states) : null;
    var r0 = el.getRootNode && el.getRootNode(), in0 = r0 && r0.querySelector ? r0.querySelector('.cal-code input') : null;
    if (I0 && (spec.s === 'alarm_disarm' ? I0.needDis : I0.needArm) && !(in0 && String(in0.value || '').trim())) { run(spec, el); return true; }
    var tr = window.casoraTr || function (x) { return x; };
    window.casoraAsk({ title: tr(typeof ask === 'string' ? ask : 'Wirklich?'), yes: tr(el.getAttribute('aria-label') || 'OK') })
      .then(function (ok) { if (ok) run(spec, el); }, function (e) { AL.fail(e); });
    return true;
  };

  // The question itself failing says so (issue 109: casoraAsk threw, the tap left no trace).
  AL.fail = function (e) {
    var tr = window.casoraTr || function (x) { return x; };
    var why = e && (e.message || e.code);
    if (window.casoraNotice) window.casoraNotice({ message: tr('Alarmanlage: Schalten hat nicht geklappt.') + (why ? ' ' + why : ''), duration: 8000 }, { overPopup: true });
  };

  // Tap on data-casora-alarm: the service with the code from the field; without a code, focus the field.
  if (!window._casoraAlarmTap) {
    window._casoraAlarmTap = true;
    var tp = null, lastTouch = 0;
    window.addEventListener('touchstart', function (ev) {
      var t = ev.touches && ev.touches[0]; tp = t ? { x: t.clientX, y: t.clientY, moved: false } : null;
    }, { capture: true, passive: true });
    window.addEventListener('touchmove', function (ev) {
      var t = ev.touches && ev.touches[0];
      if (tp && t && (Math.abs(t.clientX - tp.x) > 10 || Math.abs(t.clientY - tp.y) > 10)) tp.moved = true;
    }, { capture: true, passive: true });
    var fire = function (ev) {
      var moved = ev.type === 'touchend' && !!(tp && tp.moved);
      if (ev.type === 'touchend') tp = null;
      var path = (ev.composedPath && ev.composedPath()) || [ev.target], el = null;
      for (var i = 0; i < path.length; i++) { if (path[i] && path[i].dataset && path[i].dataset.casoraAlarm) { el = path[i]; break; } }
      if (!el) return;
      ev.stopImmediatePropagation(); ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
      if (moved) return;
      if (ev.type === 'click' && Date.now() - lastTouch < 700) return;
      if (ev.type === 'touchend') lastTouch = Date.now();
      if (Date.now() - (window._casoraPopupOpenedAt || 0) < 600) return;
      if (window.casoraHaptic) window.casoraHaptic('medium');
      var spec; try { spec = JSON.parse(el.dataset.casoraAlarm); } catch (e) { return; }
      // Popup v3: a dangerous main action asks first (confirm as in the shared services).
      var ask = spec && spec.confirm && window.casoraAsk ? spec.confirm : null;
      spec = AL.spec(spec); if (!spec) return;
      if (ask && AL.ask(spec, el, ask, run)) return;
      run(spec, el);
    };
    var run = function (spec, el) {
      var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass) return;
      var I = AL.info(spec.e, hass.states);
      var need = spec.s === 'alarm_disarm' ? I.needDis : I.needArm;
      var root = el.getRootNode && el.getRootNode();
      var inp = root && root.querySelector ? root.querySelector('.cal-code input') : null;
      var code = inp ? String(inp.value || '').trim() : '';
      if (need && !code) {
        if (inp) { inp.focus(); inp.animate && inp.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
        return;
      }
      var data = { entity_id: spec.e }; if (code) data.code = code;
      hass.callService('alarm_control_panel', spec.s, data).catch(function () {
        // HA's callService shows its own error toast; the field only says why when a code was given.
        if (inp) { inp.value = ''; inp.placeholder = 'Code falsch'; inp.focus(); }
      });
      if (inp) inp.value = '';
    };
    window.addEventListener('touchend', fire, true);
    window.addEventListener('click', fire, true);
    window.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = ev.composedPath ? ev.composedPath()[0] : ev.target;
      if (t && t.dataset && t.dataset.casoraAlarm) { ev.preventDefault(); t.click(); }
    }, true);
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  // Extra CSS for casora_popup_camera (soft only): buttons as sand circles with a label,
  // active buttons light and raised like the segments, tiles and live picture with the soft rounding,
  // plus a status line (.cam-mode: live / picture / offline / last recording).
  window._casoraCamSoft = {
    css: function () {
      return '\n/* Weich (01.10.2026) */'
        + '\n.casora-cam-tile { border-radius: var(--casora-popup-row-radius, 24px) !important; box-shadow: var(--casora-soft-cam-tile-shadow, 0 10px 24px -16px rgba(90,70,50,0.45)) !important; }'
        + '\n.cam-stream-mount { border-radius: var(--casora-soft-cam-radius, 28px) !important; box-shadow: var(--casora-soft-cam-shadow, 0 18px 40px -24px rgba(90,70,50,0.55)) !important; }'
        + '\n.cam-frame { max-height: 58vh; }'
        /* v3 image stage (S5): the picture stands free on the stage (no plate) and is clipped to the popup row radius –
           its own radius 28 and drop shadow belonged to the old free-standing picture and were cut off there (popup-raender). */
        + '\n.hui-st-img .cam-stream-mount { border-radius: var(--casora-popup-row-radius, 24px) !important; box-shadow: none !important; }'
        /* Fix round 1 (B-06/B-18): error area warm anthracite instead of black, type as everywhere. */
        + '\n.cam-stream-mount { background: var(--casora-soft-cam-fail, #24211E) !important; }'
        + '\n.casora-cam-offline { background: transparent !important; font-family: var(--primary-font-family, system-ui) !important; }'
        + '\n.casora-cam-offline .cam-retry { font-family: var(--primary-font-family, system-ui) !important; font-weight: 600 !important; }'
        /* Labels are wider than the 52 px buttons: at 16 px „Aufnahme“ and „Beschreiben“ touched. */
        + '\n.cam-controls { gap: 34px 24px !important; padding-bottom: 26px !important; }'
        + '\n.cam-controls > * { --cam-rim: none; box-shadow: none !important;'
        + ' background: var(--casora-soft-control-fill, rgba(140,115,90,0.10)) !important;'
        + ' color: var(--casora-popup-tiles-text-primary, #3A322B) !important; }'
        + '\n.cam-controls > * ha-icon { color: inherit !important; }'
        + '\n.cam-controls > *[data-on] { background: var(--casora-lps-seg-on, #FFFDF9) !important;'
        + ' color: var(--casora-lps-seg-on-ink, #2E2721) !important; box-shadow: var(--casora-lps-seg-on-shadow, none) !important; }'
        + '\n.cam-controls > *[data-confirm] { background: var(--casora-color-orange, #DE8A4E) !important; color: #fff !important; }'
        + '\n@media (hover: hover) { .cam-controls > *:hover { box-shadow: none !important; filter: brightness(0.97); }'
        + ' .cam-controls > *[data-on]:hover { box-shadow: var(--casora-lps-seg-on-shadow, none) !important; } }'
        + '\n.cam-controls > * > .cam-lbl { top: calc(100% + 8px); font-size: 12px; font-weight: 600;'
        + ' color: var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary)); }'
        + '\n.cam-mode-row { display: flex; justify-content: center; margin: -4px 0 2px; }'
        + '\n.cam-mode { display: inline-flex; align-items: center; gap: 7px; font-family: var(--primary-font-family, system-ui);'
        + ' font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 999px;'
        + ' background: var(--casora-soft-row-fill, rgba(140,115,90,0.07)); color: var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary)); }'
        + '\n.cam-mode::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--casora-color-orange, #DE8A4E); }'
        + '\n.cam-mode:empty { display: none; }';
    },
    // Status line under the live picture; _casoraCAM.setMode fills .cam-mode.
    mode: function () {
      return '<div class="cam-mode-row"><span class="cam-mode"></span></div>';
    },

    // ── Declutter (E3, 01.10.2026) ──
    // Hide technical variants: „Schnappschüsse …“ and only one stream per device
    // (Reolink creates main/sub/ext and snapshot cameras). Only without an own selection
    // (variables.cameras); variables.show_stream_variants: true shows all again.
    filter: function (ids, hass, variables) {
      var v = variables || {};
      if (v.show_stream_variants === true || (Array.isArray(v.cameras) && v.cameras.filter(Boolean).length)) return ids;
      var R = (hass && hass.entities) || {}, S = (hass && hass.states) || {};
      var name = function (id) { return String((S[id] && S[id].attributes && S[id].attributes.friendly_name) || ''); };
      var snap = function (id) {
        return /^snapshots?(_|$)/.test(String((R[id] || {}).translation_key || '')) || /schnappsch|snapshot/i.test(name(id) + ' ' + id);
      };
      var PREF = ['main', 'clear', 'sub', 'fluent', 'ext', 'balanced'];
      var dead = function (id) { var st = S[id]; return !st || st.state === 'unavailable' || st.state === 'unknown'; };
      var rank = function (id) {
        var i = PREF.indexOf(String((R[id] || {}).translation_key || ''));
        if (i < 0) i = /(_main|hochaufl|clear)\b/i.test(id + ' ' + name(id)) ? 0 : 10;
        return (dead(id) ? 100 : 0) + i;
      };
      var out = ids.filter(function (id) { return !snap(id); });
      var best = {};
      out.forEach(function (id) {
        var d = (R[id] || {}).device_id; if (!d) return;
        if (!best[d] || rank(id) < rank(best[d])) best[d] = id;
      });
      return out.filter(function (id) { var d = (R[id] || {}).device_id; return !d || best[d] === id; });
    },
    // Display name without stream technics: „Küche CamProxy_Kueche_main“ → „Küche“.
    label: function (id, st, hass, fallback) {
      var R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
      var e = R[id] || {};
      var dev = e.device_id ? D[e.device_id] : null;
      var dn = String((dev && (dev.name_by_user || dev.name)) || '').trim();
      var fn = String(fallback || '').trim();
      if (!dn) return fn;
      var rest = fn.indexOf(dn) === 0 ? fn.slice(dn.length).trim() : null;
      if (rest === '' || (rest != null && /_|hochaufl|standardaufl|aufl[oö]sung|fluent|clear|\bmain\b|\bsub\b|stream|live/i.test(rest))) return dn;
      if (/_/.test(fn)) return dn;
      return fn;
    },
    // „vor 41 Min.“ instead of „41m“; a motion sensor as the source: „Bewegung vor 2 Min.“
    age: function (ms, motion) {
      if (!isFinite(ms) || ms < 0) return '';
      var m = Math.floor(ms / 60000);
      var t = m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.floor(m / 60) + ' Std.' : 'vor ' + (window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.floor(m / 1440)) + ' T.';
      return motion ? 'Bewegung ' + t : t;
    },
    // Back to the overview – a visible arrow over the live picture.
    back: function (bindAttr) {
      return '<div class="cam-back-row"><div class="cam-back" role="button" aria-label="Zurück"' + bindAttr + '>'
        + '<ha-icon icon="mdi:chevron-left" style="--mdc-icon-size:22px;"></ha-icon><span>Alle Kameras</span></div></div>';
    },
    // Double click or double tap on the picture: fill ↔ fit (instead of an own button).
    dtap: function (ev, el) {
      var C = window._casoraCAM; if (!C || !el) return;
      var now = Date.now();
      if (ev.type === 'touchend') {
        if (el._casoraLt && now - el._casoraLt < 320) {
          el._casoraLt = 0; el._casoraDone = now;
          if (ev.cancelable) ev.preventDefault();
          C.toggleFit(el);
        } else el._casoraLt = now;
        return;
      }
      if (now - (el._casoraDone || 0) < 700) return;
      C.toggleFit(el);
    },
    css2: function () {
      // No negative top margin: the row is the first child of the button-card's ha-card (overflow: hidden),
      // a pull upwards cut the pill's top edge off (issue 112). The bottom pull only tightens the gap to the picture.
      return '\n.cam-back-row { display: flex; margin: 0 0 -6px; }'
        + '\n.cam-back { display: inline-flex; align-items: center; gap: 2px; min-height: 40px; padding: 0 16px 0 8px; border-radius: 999px; cursor: pointer;'
        + ' pointer-events: auto; touch-action: manipulation; -webkit-tap-highlight-color: transparent;'
        + ' font-family: var(--primary-font-family, system-ui); font-size: 14px; font-weight: 700;'
        + ' background: var(--casora-soft-row-fill, rgba(140,115,90,0.07)); color: var(--casora-popup-tiles-text-primary, #3A322B); }'
        + '\n@media (hover: hover) { .cam-back:hover { background: var(--casora-soft-row-hover, rgba(140,115,90,0.11)); } }'
        + '\n.cam-stream-mount { cursor: zoom-in; }';
    },
  };
})();
