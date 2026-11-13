// „Willkommen bei Casora“ / „Neu in Casora x.y.z“
// (like the „Was ist neu“ screen after an iOS update). Shows once per
// version and browser in the Studio.
//
// On every release: fill WHATS_NEW with the news (2-4 entries, a picture where it helps), bump the version
// in manifest.json, extend the CHANGELOG. The version comes from the
// loader URL (?v=<version>.<stamp>) that the integration writes on startup.
(() => {
  if (window.__casoraWelcome) return;
  window.__casoraWelcome = true;

  const VERSION = (() => {
    try {
      const v = new URL(import.meta.url).searchParams.get("v") || "";
      return v.split(".").slice(0, 3).join(".") || "0";
    } catch (e) { return "0"; }
  })();
  const SEEN_KEY = "casora.seenVersion";
  const CHANGELOG_URL = "https://github.com/SH1FT-W/casora/blob/main/CHANGELOG.md";

  const TEXT = {
    de: {
      welcomeTitle: "Willkommen bei Casora",
      whatsNewTitle: "Neu in Casora {version}",
      continue: "Weiter",
      all: "Alle Änderungen",
      w1t: "Raum für Raum", w1: "Gestalte dein Dashboard mit den Geräten, die du schon in Home Assistant hast.",
      w2t: "Geräte-Assistent", w2: "Casora schlägt für jeden Raum passende Kacheln vor und baut sie ein.",
      w3t: "Desktop, Tablet und Handy", w3: "Ein Dashboard, das sich jedem Bildschirm anpasst, mit eigener Handy-Ansicht.",
      n0t: "Neue Bildschirmschoner", n0: "Kameras und Monatskalender, dazu deine Auswahl fürs Abwechseln und Start im ⋯-Menü.",
      n1t: "Verbrauch je Gerät", n1: "Im Energie-Popup nach Tag, Woche und Monat.",
      n2t: "Mitteilungen gestapelt", n2: "Wiederholungen mit Zähler, ein Alarm bleibt oben.",
      n3t: "Nur ansehen", n3: "Kacheln, die zeigen, aber nichts schalten. Im Studio unter Tippverhalten.",
    },
    en: {
      welcomeTitle: "Welcome to Casora",
      whatsNewTitle: "New in Casora {version}",
      continue: "Continue",
      all: "All changes",
      w1t: "Room by room", w1: "Design your dashboard with the devices you already have in Home Assistant.",
      w2t: "Device Assistant", w2: "Casora suggests the right tiles for every room and adds them for you.",
      w3t: "Desktop, tablet and phone", w3: "One dashboard that fits every screen, with its own phone layout.",
      n0t: "New screensavers", n0: "Cameras and a month calendar, plus your pick of what alternates and a start from the ⋯ menu.",
      n1t: "Consumption per device", n1: "In the energy popup by day, week and month.",
      n2t: "Stacked notifications", n2: "Repeats with a count, an alarm stays on top.",
      n3t: "View only", n3: "Tiles that show but switch nothing. In the Studio under When tapped.",
    },
    // Spanish: same keys as en (dev/unit/welcome_es.mjs); a missing key falls back to English.
    es: {
      welcomeTitle: "Te damos la bienvenida a Casora",
      whatsNewTitle: "Novedades de Casora {version}",
      continue: "Continuar",
      all: "Todos los cambios",
      w1t: "Habitación por habitación", w1: "Diseña tu panel con los dispositivos que ya tienes en Home Assistant.",
      w2t: "Asistente de dispositivos", w2: "Casora propone las tarjetas adecuadas para cada habitación y las añade por ti.",
      w3t: "Escritorio, tableta y móvil", w3: "Un panel que se adapta a cada pantalla, con su propio diseño para el móvil.",
      n0t: "Nuevos salvapantallas", n0: "Cámaras y un calendario mensual, además de elegir cuáles se alternan e iniciarlos desde el menú ⋯.",
      n1t: "Consumo por dispositivo", n1: "En el popup de energía por día, semana y mes.",
      n2t: "Notificaciones agrupadas", n2: "Repeticiones con contador, una alarma queda arriba.",
      n3t: "Solo ver", n3: "Mosaicos que muestran pero no encienden nada. En el Studio, en Al tocar.",
    },
    fr: {
      welcomeTitle: "Bienvenue dans Casora",
      whatsNewTitle: "Nouveautés de Casora {version}",
      continue: "Continuer",
      all: "Tous les changements",
      w1t: "Pièce par pièce",
      w1: "Conçois ton tableau de bord avec les appareils que tu as déjà dans Home Assistant.",
      w2t: "Assistant appareils",
      w2: "Casora propose les tuiles adaptées à chaque pièce et les ajoute pour toi.",
      w3t: "Ordinateur, tablette et téléphone",
      w3: "Un tableau de bord qui s'adapte à chaque écran, avec sa propre mise en page téléphone.",
      n0t: "Nouveaux économiseurs", n0: "Caméras et calendrier du mois, avec ton choix de ceux qui alternent et un lancement depuis le menu ⋯.",
      n1t: "Consommation par appareil", n1: "Dans le popup énergie, par jour, semaine et mois.",
      n2t: "Notifications regroupées", n2: "Les répétitions avec un compteur, une alarme reste en haut.",
      n3t: "Lecture seule", n3: "Des tuiles qui affichent sans rien commander. Dans le Studio, sous Au toucher.",
    },
    it: {
      welcomeTitle: "Ti diamo il benvenuto in Casora",
      whatsNewTitle: "Novità di Casora {version}",
      continue: "Continua",
      all: "Tutte le modifiche",
      w1t: "Stanza per stanza",
      w1: "Progetta la tua dashboard con i dispositivi che hai già in Home Assistant.",
      w2t: "Assistente dispositivi",
      w2: "Casora propone le schede adatte per ogni stanza e le aggiunge per te.",
      w3t: "Desktop, tablet e telefono",
      w3: "Una dashboard che si adatta a ogni schermo, con un layout dedicato per il telefono.",
      n0t: "Nuovi salvaschermi", n0: "Telecamere e calendario mensile, più la scelta di quali alternare e l'avvio dal menu ⋯.",
      n1t: "Consumo per dispositivo", n1: "Nel popup energia per giorno, settimana e mese.",
      n2t: "Notifiche raggruppate", n2: "Ripetizioni con contatore, un allarme resta in alto.",
      n3t: "Solo visualizzazione", n3: "Tessere che mostrano ma non comandano nulla. Nello Studio, in Al tocco.",
    },
    nb: {
      welcomeTitle: "Velkommen til Casora",
      whatsNewTitle: "Nytt i Casora {version}",
      continue: "Fortsett",
      all: "Alle endringer",
      w1t: "Rom for rom",
      w1: "Lag dashbordet ditt med enhetene du allerede har i Home Assistant.",
      w2t: "Enhetsveiviser",
      w2: "Casora foreslår passende fliser for hvert rom og legger dem inn.",
      w3t: "Skrivebord, nettbrett og mobil",
      w3: "Ett dashbord som tilpasser seg hver skjerm, med egen mobilvisning.",
      n0t: "Nye skjermsparere", n0: "Kameraer og månedskalender, pluss ditt valg av hvilke som veksler og start fra ⋯-menyen.",
      n1t: "Forbruk per enhet", n1: "I energi-popupen per dag, uke og måned.",
      n2t: "Varsler samlet", n2: "Gjentakelser med teller, en alarm blir liggende øverst.",
      n3t: "Bare visning", n3: "Fliser som viser, men ikke styrer noe. I Studio under Ved trykk.",
    },
    nl: {
      welcomeTitle: "Welkom bij Casora",
      whatsNewTitle: "Nieuw in Casora {version}",
      continue: "Verder",
      all: "Alle wijzigingen",
      w1t: "Kamer voor kamer",
      w1: "Ontwerp je dashboard met de apparaten die je al in Home Assistant hebt.",
      w2t: "Apparaatassistent",
      w2: "Casora stelt voor elke kamer passende tegels voor en bouwt ze in.",
      w3t: "Desktop, tablet en telefoon",
      w3: "Eén dashboard dat zich aan elk scherm aanpast, met een eigen telefoonweergave.",
      n0t: "Nieuwe schermbeveiligers", n0: "Camera's en een maandkalender, plus je keuze wat afwisselt en starten vanuit het ⋯-menu.",
      n1t: "Verbruik per apparaat", n1: "In de energiepopup per dag, week en maand.",
      n2t: "Meldingen gestapeld", n2: "Herhalingen met een teller, een alarm blijft bovenaan.",
      n3t: "Alleen bekijken", n3: "Tegels die tonen maar niets schakelen. In de Studio onder Bij tikken.",
    },
    pl: {
      welcomeTitle: "Witaj w Casora",
      whatsNewTitle: "Nowości w Casora {version}",
      continue: "Dalej",
      all: "Wszystkie zmiany",
      w1t: "Pokój po pokoju",
      w1: "Zaprojektuj swój pulpit z urządzeń, które już masz w Home Assistant.",
      w2t: "Asystent urządzeń",
      w2: "Casora proponuje pasujące kafelki dla każdego pokoju i dodaje je za ciebie.",
      w3t: "Komputer, tablet i telefon",
      w3: "Jeden pulpit, który dopasowuje się do każdego ekranu, z własnym układem na telefon.",
      n0t: "Nowe wygaszacze", n0: "Kamery i kalendarz miesięczny, do tego wybór, które się zmieniają, i start z menu ⋯.",
      n1t: "Zużycie według urządzeń", n1: "W oknie energii według dnia, tygodnia i miesiąca.",
      n2t: "Powiadomienia w stosach", n2: "Powtórzenia z licznikiem, alarm zostaje na górze.",
      n3t: "Tylko podgląd", n3: "Kafelki, które pokazują, ale niczego nie przełączają. W Studio w sekcji Po dotknięciu.",
    },
    pt: {
      welcomeTitle: "Bem-vindo ao Casora",
      whatsNewTitle: "Novidades do Casora {version}",
      continue: "Continuar",
      all: "Todas as alterações",
      w1t: "Divisão a divisão",
      w1: "Desenha o teu painel com os dispositivos que já tens no Home Assistant.",
      w2t: "Assistente de dispositivos",
      w2: "O Casora propõe os cartões certos para cada divisão e adiciona-os por ti.",
      w3t: "Computador, tablet e telemóvel",
      w3: "Um painel que se adapta a cada ecrã, com layout próprio para o telemóvel.",
      n0t: "Novas proteções de ecrã", n0: "Câmaras e um calendário mensal, além de escolheres quais alternam e iniciá-las no menu ⋯.",
      n1t: "Consumo por dispositivo", n1: "No popup de energia por dia, semana e mês.",
      n2t: "Notificações agrupadas", n2: "Repetições com contador, um alarme fica no topo.",
      n3t: "Só ver", n3: "Mosaicos que mostram mas não ligam nada. No Studio, em Ao tocar.",
    },
  };
  // Texts for a language: its own, English for anything it does not have (yet).
  const texts = (lang) => Object.assign({}, TEXT.en, TEXT[String(lang || "").split(/[-_]/)[0]] || {});

  /** First visit: what Casora is - three lines, no more. */
  const WELCOME = [
    ["mdi:view-dashboard-edit-outline", "w1t", "w1"],
    ["mdi:auto-fix", "w2t", "w2"],
    ["mdi:cellphone-link", "w3t", "w3"],
  ];

  /** After an update: the news of this version - replace on every release. */
  // An optional fourth value is a picture under the text (a file in assets/news, served under /casora_assets/news).
  const WHATS_NEW = [
    ["mdi:monitor-shimmer", "n0t", "n0", "screensavers-2.jpg"],
    ["mdi:chart-bar-stacked", "n1t", "n1"],
    ["mdi:bell-badge-outline", "n2t", "n2"],
    ["mdi:eye-outline", "n3t", "n3"],
  ];
  // A big release may set its own headline (a TEXT key); the version then stands small under it. null: "New in Casora x".
  const WHATS_NEW_HEAD = null;
  const NEWS_IMG = "/casora_assets/news/";

  // Decide on load - before the Studio writes its own casora.* keys.
  const startMode = (() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === VERSION) return null;
      if (seen !== null) return "whatsNew";
      // Studio used before this sheet existed → an update.
      const used = Object.keys(localStorage).some((k) => /^casora[._-]/i.test(k) && k !== SEEN_KEY);
      return used ? "whatsNew" : "welcome";
    } catch (e) { return null; }
  })();

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, VERSION); } catch (e) { /* ohne Speicher eben wieder */ }
  }

  // The app mark (brand/icon.svg): roof and rooms in clay, one window in honey.
  const MARK = '<svg viewBox="48 52 416 416" aria-hidden="true">'
    + '<path d="M76 236 256 86l180 150" fill="none" stroke="#B67A50" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<rect x="138" y="254" width="104" height="96" rx="26" fill="#E8B04A"/><g fill="#B67A50"><rect x="270" y="254" width="104" height="96" rx="26"/>'
    + '<rect x="138" y="366" width="104" height="96" rx="26"/><rect x="270" y="366" width="104" height="96" rx="26"/></g></svg>';

  const CSS = `
    .cw-scrim{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;
      background:rgba(0,0,0,.45);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);
      animation:cw-in .28s ease both;font-family:var(--primary-font-family, system-ui, sans-serif)}
    .cw-sheet{width:min(460px,100%);max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;
      padding:34px 30px 26px;border-radius:26px;background:var(--casora-studio-sheet, #1c1e24);color:var(--casora-studio-ink, #fff);
      box-shadow:0 30px 80px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08);
      display:grid;justify-items:center;gap:18px;animation:cw-up .38s var(--casora-ease-enter, cubic-bezier(.2,.8,.3,1)) both}
    .cw-mark{width:64px;height:64px;filter:drop-shadow(0 10px 22px rgba(240,140,80,.45))}
    .cw-sheet h2{margin:0;font-size:34px;font-weight:700;letter-spacing:-.03em;text-align:center;text-wrap:balance}
    .cw-sheet ul{list-style:none;margin:6px 0;padding:0;display:grid;gap:18px;width:100%}
    .cw-sheet li{display:grid;grid-template-columns:40px 1fr;gap:14px;align-items:start;line-height:1.4;color:var(--casora-studio-ink-2, rgba(255,255,255,.62));font-size:15px}
    .cw-sheet li b{color:var(--casora-studio-ink, #fff);font-weight:600}
    .cw-ver{margin-top:-12px;font-size:14px;font-weight:600;letter-spacing:.02em;color:var(--casora-studio-ink-2, rgba(255,255,255,.62))}
    .light .cw-ver{color:var(--casora-studio-ink-2, #6e6e73)}
    .cw-pic{display:block;width:100%;height:auto;margin-top:10px;border-radius:12px}
    .cw-sheet li ha-icon{--mdc-icon-size:30px;color:var(--casora-studio-accent, #00C3D0);margin-top:2px}
    .cw-go{width:100%;height:52px;border:0;border-radius:26px;background:var(--casora-studio-done, linear-gradient(to bottom,#2fd6e0,#00a8b4));
      color:var(--casora-studio-on-done, #fff);font:inherit;font-size:17px;font-weight:600;cursor:pointer}
    .cw-go:focus-visible{outline:2px solid #7fe8ef;outline-offset:3px}
    .cw-all{color:var(--casora-studio-link, #2fd6e0);font-size:15px;text-decoration:none}
    .light .cw-sheet{background:var(--casora-studio-sheet, #f2f2f7);color:var(--casora-studio-ink, #1d1d1f);box-shadow:0 30px 80px -20px rgba(0,0,0,.35), inset 0 0 0 .5px rgba(0,0,0,.06)}
    .light .cw-sheet li{color:var(--casora-studio-ink-2, #6e6e73)}
    .light .cw-sheet li b{color:var(--casora-studio-ink, #1d1d1f)}
    .light .cw-sheet li ha-icon{color:var(--casora-studio-accent, #00838c)}
    .light .cw-all{color:var(--casora-studio-link, #00838c)}
    .light.cw-scrim{background:rgba(0,0,0,.22)}
    @keyframes cw-in{from{opacity:0}to{opacity:1}}
    @keyframes cw-up{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion: reduce){.cw-scrim,.cw-sheet{animation:none}}`;

  const newsTitle = (L) => (WHATS_NEW_HEAD && L[WHATS_NEW_HEAD]) || L.whatsNewTitle.replace("{version}", VERSION);
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function show(mode, lang) {
    const L = texts(lang);
    const list = mode === "welcome" ? WELCOME : WHATS_NEW;
    const host = document.createElement("div");
    host.setAttribute("data-casora-welcome", "");
    const root = host.attachShadow({ mode: "open" });
    // Light when HA is light (like the Studio).
    const themes = ((document.querySelector("home-assistant") || {}).hass || {}).themes;
    const light = !!(themes && themes.darkMode === false);
    root.innerHTML = `<style>${CSS}</style><div class="cw-scrim${light ? " light" : ""}" role="dialog" aria-modal="true" aria-labelledby="cw-t">
      <div class="cw-sheet"><div class="cw-mark">${MARK}</div>
      <h2 id="cw-t">${esc(mode === "welcome" ? L.welcomeTitle : newsTitle(L))}</h2>${mode !== "welcome" && WHATS_NEW_HEAD ? `<div class="cw-ver">Casora ${esc(VERSION)}</div>` : ""}
      <ul>${list.map(([icon, t, x, img]) => `<li><ha-icon icon="${icon}"></ha-icon><span><b>${esc(L[t])}</b><br>${esc(L[x])}${img ? `<img class="cw-pic" src="${NEWS_IMG}${esc(img)}?v=${esc(VERSION)}" alt="" loading="lazy">` : ""}</span></li>`).join("")}</ul>
      <button class="cw-go">${esc(L.continue)}</button>
      ${mode === "welcome" ? "" : `<a class="cw-all" href="${CHANGELOG_URL.replace(/\.md$/, String(lang || "").toLowerCase().split(/[-_]/)[0] === "de" ? ".de.md" : ".md")}" target="_blank" rel="noreferrer">${esc(L.all)}</a>`}
      </div></div>`;
    const close = () => { markSeen(); host.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
    root.querySelector(".cw-go").addEventListener("click", close);
    root.querySelector(".cw-scrim").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
  }

  // For the updates page: the same news as plain text („Neu in …“).
  window.casoraWhatsNew = (lang) => {
    const L = texts(lang);
    return { version: VERSION, title: WHATS_NEW_HEAD ? newsTitle(L) + " · Casora " + VERSION : newsTitle(L),
      items: WHATS_NEW.map(([, t, x]) => [L[t], L[x]]) };
  };

  window.casoraWelcomeShow = (mode) => show(mode || "whatsNew",
    ((document.querySelector("home-assistant") || {}).hass || {}).language);

  if (!startMode) return;

  // Wait until the Studio knows whether dashboards exist: without a Casora dashboard
  // the Studio greets on its own („Willkommen bei Casora“ before the assistant) - then not twice.
  const t0 = Date.now();
  const find = (root, d) => {
    if (!root || d > 8) return null;
    const hit = root.querySelector && root.querySelector("casora-panel");
    if (hit) return hit;
    for (const el of (root.querySelectorAll ? root.querySelectorAll("*") : [])) {
      if (el.shadowRoot) { const f = find(el.shadowRoot, d + 1); if (f) return f; }
    }
    return null;
  };
  const wait = () => {
    const p = find(document, 0);
    const ready = p && p._hass && Array.isArray(p._dashList);
    if (!ready && Date.now() - t0 < 15000) { setTimeout(wait, 300); return; }
    if (!p || !p.isConnected) return;
    // No Casora dashboard yet = a new user (E12, test 2): the Studio greets; no "New in Casora" list of changes
    // they never knew, even when other casora.* keys made this look like an update.
    if (!(p._dashList || []).length) { markSeen(); return; }
    show(startMode, p._hass && p._hass.language);
  };
  setTimeout(wait, 600);
})();
