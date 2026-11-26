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
  // YY.M.N with an optional beta bK: numbers compared in order, a beta before its release (26.11.30b7 < 26.11.30).
  const verParts = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)(?:b(\d+))?/.exec(String(v || "")); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? Infinity : +m[4]] : null; };
  const verCmp = (a, b) => { const x = verParts(a), y = verParts(b); if (!x || !y) return 0; for (let i = 0; i < 4; i++) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; } return 0; };
  // The version this browser saw before (for "Everything new since …" after skipping releases), read once on load.
  const SEEN_BEFORE = (() => { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } })();
  // Keys only the Studio writes once someone has been in it: its intro (casora-panel-b-plus.js) or welcome (casora-panel.js).
  const STUDIO_USED = /^casora\.(studio\.intro|welcomed)$/;
  const CHANGELOG_URL = "https://github.com/SH1FT-W/casora/blob/main/CHANGELOG.md";

  const TEXT = {
    de: {
      welcomeTitle: "Willkommen bei Casora",
      whatsNewTitle: "Neu in Casora {version}",
      continue: "Weiter",
      all: "Alle Änderungen",
      allSince: "Alle Neuerungen seit {version}",
      w1t: "Raum für Raum", w1: "Gestalte dein Dashboard mit den Geräten, die du schon in Home Assistant hast.",
      w2t: "Geräte-Assistent", w2: "Casora schlägt für jeden Raum passende Kacheln vor und baut sie ein.",
      w3t: "Desktop, Tablet und Handy", w3: "Ein Dashboard, das sich jedem Bildschirm anpasst, mit eigener Handy-Ansicht.",
      nh: "Das nächste Level",
      h0t: "Die Klingel kommt nach vorn", h0: "Klingelt es, zeigt jedes Dashboard das Livebild der Tür, auch aus dem Bildschirmschoner.",
      h1t: "Wettereffekte auf dem Dashboard", h1: "Regen, Schnee, Nebel und Wind ziehen leicht über das Raumfoto.",
      h2t: "Assist zeigt das passende Popup", h2: "Frag nach dem wärmsten Raum oder der Kamera an der Tür, auch ohne KI-Modell.",
      h3t: "Tablet wacht auf, wenn du kommst", h3: "Ein Bewegungsmelder beendet den Bildschirmschoner, nachts nur eine gedimmte Uhr.",
      n0t: "Großer Prüflauf", n0: "20 KI-Tester haben jede Funktion durchgeklickt, rund 150 Funde sind behoben.",
      n1t: "Zurück wie gewohnt", n1: "Die Zurück-Taste am Handy schließt erst das Popup und führt aus dem Raum nach Zuhause.",
    },
    en: {
      welcomeTitle: "Welcome to Casora",
      whatsNewTitle: "New in Casora {version}",
      continue: "Continue",
      all: "All changes",
      allSince: "Everything new since {version}",
      w1t: "Room by room", w1: "Design your dashboard with the devices you already have in Home Assistant.",
      w2t: "Device Assistant", w2: "Casora suggests the right tiles for every room and adds them for you.",
      w3t: "Desktop, tablet and phone", w3: "One dashboard that fits every screen, with its own phone layout.",
      nh: "The next level",
      h0t: "The doorbell comes to the front", h0: "When it rings, every dashboard shows the door's live picture, even from the screensaver.",
      h1t: "Weather effects on the dashboard", h1: "Rain, snow, fog and wind move lightly over the room photo.",
      h2t: "Assist shows the matching popup", h2: "Ask for the warmest room or the camera at the door, no AI model needed.",
      h3t: "The tablet wakes when you come in", h3: "A motion sensor ends the screensaver, at night only a dimmed clock.",
      n0t: "A big test round", n0: "20 AI testers clicked through every function, about 150 findings are fixed.",
      n1t: "Back as you expect", n1: "The phone's back button closes the popup first and leads from a room to Home.",
    },
    // Spanish: same keys as en (dev/unit/welcome_es.mjs); a missing key falls back to English.
    es: {
      welcomeTitle: "Te damos la bienvenida a Casora",
      whatsNewTitle: "Novedades de Casora {version}",
      continue: "Continuar",
      all: "Todos los cambios",
      allSince: "Todas las novedades desde {version}",
      w1t: "Habitación por habitación", w1: "Diseña tu panel con los dispositivos que ya tienes en Home Assistant.",
      w2t: "Asistente de dispositivos", w2: "Casora propone las tarjetas adecuadas para cada habitación y las añade por ti.",
      w3t: "Escritorio, tableta y móvil", w3: "Un panel que se adapta a cada pantalla, con su propio diseño para el móvil.",
      nh: "El siguiente nivel",
      h0t: "El timbre pasa al frente", h0: "Cuando suena, cada panel muestra la imagen en directo de la puerta, también desde el salvapantallas.",
      h1t: "Efectos del tiempo en el panel", h1: "Lluvia, nieve, niebla y viento pasan suavemente sobre la foto de la habitación.",
      h2t: "Assist muestra la ventana adecuada", h2: "Pregunta por la habitación más cálida o la cámara de la puerta, sin modelo de IA.",
      h3t: "La tableta despierta al llegar", h3: "Un sensor de movimiento termina el salvapantallas; de noche, solo un reloj atenuado.",
      n0t: "Una gran ronda de pruebas", n0: "20 probadores con IA recorrieron cada función; unos 150 hallazgos están corregidos.",
      n1t: "Atrás como esperas", n1: "El botón atrás del móvil cierra primero el popup y lleva de una habitación a Casa.",
    },
    fr: {
      welcomeTitle: "Bienvenue dans Casora",
      whatsNewTitle: "Nouveautés de Casora {version}",
      continue: "Continuer",
      all: "Tous les changements",
      allSince: "Toutes les nouveautés depuis {version}",
      w1t: "Pièce par pièce",
      w1: "Conçois ton tableau de bord avec les appareils que tu as déjà dans Home Assistant.",
      w2t: "Assistant appareils",
      w2: "Casora propose les tuiles adaptées à chaque pièce et les ajoute pour toi.",
      w3t: "Ordinateur, tablette et téléphone",
      w3: "Un tableau de bord qui s'adapte à chaque écran, avec sa propre mise en page téléphone.",
      nh: "Le niveau supérieur",
      h0t: "La sonnette au premier plan", h0: "Quand on sonne, chaque tableau de bord montre l'image en direct de la porte, même depuis l'économiseur d'écran.",
      h1t: "Effets météo sur le tableau de bord", h1: "Pluie, neige, brouillard et vent passent légèrement sur la photo de la pièce.",
      h2t: "Assist affiche la fenêtre correspondante", h2: "Demande la pièce la plus chaude ou la caméra de la porte, sans modèle d'IA.",
      h3t: "La tablette se réveille quand tu arrives", h3: "Un détecteur de mouvement arrête l'économiseur d'écran, la nuit seulement une horloge atténuée.",
      n0t: "Une grande campagne de tests", n0: "20 testeurs IA ont parcouru chaque fonction, environ 150 constats sont corrigés.",
      n1t: "Retour comme prévu", n1: "Le bouton retour du téléphone ferme d'abord le popup et ramène d'une pièce à Maison.",
    },
    it: {
      welcomeTitle: "Ti diamo il benvenuto in Casora",
      whatsNewTitle: "Novità di Casora {version}",
      continue: "Continua",
      all: "Tutte le modifiche",
      allSince: "Tutte le novità dalla {version}",
      w1t: "Stanza per stanza",
      w1: "Progetta la tua dashboard con i dispositivi che hai già in Home Assistant.",
      w2t: "Assistente dispositivi",
      w2: "Casora propone le schede adatte per ogni stanza e le aggiunge per te.",
      w3t: "Desktop, tablet e telefono",
      w3: "Una dashboard che si adatta a ogni schermo, con un layout dedicato per il telefono.",
      nh: "Il livello successivo",
      h0t: "Il campanello in primo piano", h0: "Quando suonano, ogni dashboard mostra l'immagine dal vivo della porta, anche dal salvaschermo.",
      h1t: "Effetti meteo sulla dashboard", h1: "Pioggia, neve, nebbia e vento passano leggeri sulla foto della stanza.",
      h2t: "Assist mostra la finestra giusta", h2: "Chiedi la stanza più calda o la telecamera della porta, senza modello IA.",
      h3t: "Il tablet si sveglia quando arrivi", h3: "Un sensore di movimento chiude il salvaschermo, di notte solo un orologio attenuato.",
      n0t: "Un grande giro di test", n0: "20 tester IA hanno provato ogni funzione, circa 150 problemi sono risolti.",
      n1t: "Indietro come ti aspetti", n1: "Il tasto indietro del telefono chiude prima il popup e riporta da una stanza a Casa.",
    },
    nb: {
      welcomeTitle: "Velkommen til Casora",
      whatsNewTitle: "Nytt i Casora {version}",
      continue: "Fortsett",
      all: "Alle endringer",
      allSince: "Alt nytt siden {version}",
      w1t: "Rom for rom",
      w1: "Lag dashbordet ditt med enhetene du allerede har i Home Assistant.",
      w2t: "Enhetsveiviser",
      w2: "Casora foreslår passende fliser for hvert rom og legger dem inn.",
      w3t: "Skrivebord, nettbrett og mobil",
      w3: "Ett dashbord som tilpasser seg hver skjerm, med egen mobilvisning.",
      nh: "Neste nivå",
      h0t: "Ringeklokken kommer frem", h0: "Når det ringer, viser hvert dashbord direktebildet fra døren, også fra skjermspareren.",
      h1t: "Væreffekter på dashbordet", h1: "Regn, snø, tåke og vind glir lett over rombildet.",
      h2t: "Assist viser riktig vindu", h2: "Spør etter det varmeste rommet eller kameraet ved døren, uten KI-modell.",
      h3t: "Nettbrettet våkner når du kommer", h3: "En bevegelsessensor avslutter skjermspareren, om natten bare en dempet klokke.",
      n0t: "En stor testrunde", n0: "20 KI-testere klikket seg gjennom alle funksjoner, rundt 150 funn er rettet.",
      n1t: "Tilbake som forventet", n1: "Tilbake-knappen på mobilen lukker først popupen og fører fra et rom til Hjem.",
    },
    nl: {
      welcomeTitle: "Welkom bij Casora",
      whatsNewTitle: "Nieuw in Casora {version}",
      continue: "Verder",
      all: "Alle wijzigingen",
      allSince: "Alles nieuw sinds {version}",
      w1t: "Kamer voor kamer",
      w1: "Ontwerp je dashboard met de apparaten die je al in Home Assistant hebt.",
      w2t: "Apparaatassistent",
      w2: "Casora stelt voor elke kamer passende tegels voor en bouwt ze in.",
      w3t: "Desktop, tablet en telefoon",
      w3: "Eén dashboard dat zich aan elk scherm aanpast, met een eigen telefoonweergave.",
      nh: "Het volgende niveau",
      h0t: "De deurbel komt naar voren", h0: "Als er wordt aangebeld, toont elk dashboard het livebeeld van de deur, ook vanuit de schermbeveiliging.",
      h1t: "Weereffecten op het dashboard", h1: "Regen, sneeuw, mist en wind trekken licht over de kamerfoto.",
      h2t: "Assist toont het juiste venster", h2: "Vraag naar de warmste kamer of de camera bij de deur, zonder AI-model.",
      h3t: "De tablet wordt wakker als je binnenkomt", h3: "Een bewegingssensor beëindigt de schermbeveiliging, 's nachts alleen een gedimde klok.",
      n0t: "Een grote testronde", n0: "20 AI-testers klikten door elke functie, ongeveer 150 bevindingen zijn opgelost.",
      n1t: "Terug zoals verwacht", n1: "De terugknop van de telefoon sluit eerst de popup en leidt van een kamer naar Thuis.",
    },
    pl: {
      welcomeTitle: "Witaj w Casora",
      whatsNewTitle: "Nowości w Casora {version}",
      continue: "Dalej",
      all: "Wszystkie zmiany",
      allSince: "Wszystkie nowości od {version}",
      w1t: "Pokój po pokoju",
      w1: "Zaprojektuj swój pulpit z urządzeń, które już masz w Home Assistant.",
      w2t: "Asystent urządzeń",
      w2: "Casora proponuje pasujące kafelki dla każdego pokoju i dodaje je za ciebie.",
      w3t: "Komputer, tablet i telefon",
      w3: "Jeden pulpit, który dopasowuje się do każdego ekranu, z własnym układem na telefon.",
      nh: "Kolejny poziom",
      h0t: "Dzwonek na pierwszym planie", h0: "Gdy ktoś dzwoni, każdy pulpit pokazuje obraz na żywo spod drzwi, także z wygaszacza.",
      h1t: "Efekty pogody na pulpicie", h1: "Deszcz, śnieg, mgła i wiatr lekko przesuwają się po zdjęciu pokoju.",
      h2t: "Assist pokazuje pasujące okno", h2: "Zapytaj o najcieplejszy pokój lub kamerę przy drzwiach, bez modelu AI.",
      h3t: "Tablet budzi się, gdy wchodzisz", h3: "Czujnik ruchu kończy wygaszacz, w nocy tylko przyciemniony zegar.",
      n0t: "Duża runda testów", n0: "20 testerów AI przeklikało każdą funkcję, około 150 zgłoszeń jest poprawionych.",
      n1t: "Wstecz tak, jak trzeba", n1: "Przycisk wstecz w telefonie najpierw zamyka okno i prowadzi z pokoju do widoku Dom.",
    },
    pt: {
      welcomeTitle: "Bem-vindo ao Casora",
      whatsNewTitle: "Novidades do Casora {version}",
      continue: "Continuar",
      all: "Todas as alterações",
      allSince: "Todas as novidades desde a {version}",
      w1t: "Divisão a divisão",
      w1: "Desenha o teu painel com os dispositivos que já tens no Home Assistant.",
      w2t: "Assistente de dispositivos",
      w2: "O Casora propõe os cartões certos para cada divisão e adiciona-os por ti.",
      w3t: "Computador, tablet e telemóvel",
      w3: "Um painel que se adapta a cada ecrã, com layout próprio para o telemóvel.",
      nh: "O próximo nível",
      h0t: "A campainha vem para a frente", h0: "Quando tocam, cada painel mostra a imagem em direto da porta, também a partir da proteção de ecrã.",
      h1t: "Efeitos do tempo no painel", h1: "Chuva, neve, nevoeiro e vento passam levemente sobre a foto da divisão.",
      h2t: "O Assist mostra a janela certa", h2: "Pergunta pela divisão mais quente ou pela câmara da porta, sem modelo de IA.",
      h3t: "O tablet acorda quando chegas", h3: "Um sensor de movimento termina a proteção de ecrã; à noite, só um relógio atenuado.",
      n0t: "Uma grande ronda de testes", n0: "20 testadores com IA percorreram cada função; cerca de 150 problemas estão corrigidos.",
      n1t: "Voltar como esperas", n1: "O botão voltar do telemóvel fecha primeiro o popup e leva de uma divisão a Casa.",
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
    ["mdi:doorbell-video", "h0t", "h0"],
    ["mdi:weather-pouring", "h1t", "h1", "photo-weather.jpg"],
    ["mdi:microphone-message", "h2t", "h2"],
    ["mdi:tablet-dashboard", "h3t", "h3"],
    ["mdi:check-decagram-outline", "n0t", "n0"],
    ["mdi:arrow-left-circle-outline", "n1t", "n1"],
  ];
  // A big release may set its own headline (a TEXT key); the version then stands small under it. null: "New in Casora x".
  const WHATS_NEW_HEAD = "nh";
  const NEWS_IMG = "/casora_assets/news/";

  // Decide on load - before the Studio writes its own casora.* keys.
  const startMode = (() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === VERSION) return null;
      // Prüfrunde w01-04: back on an older version after a newer one (downgrade) shows nothing.
      if (seen !== null && verCmp(seen, VERSION) > 0) return null;
      if (seen !== null) return "whatsNew";
      // Only the Studio's own marks (its intro or welcome seen in this browser) mean "used before": a new device
      // where only the dashboard ran has casora.* keys from its scripts, and its user gets the short welcome.
      const used = Object.keys(localStorage).some((k) => STUDIO_USED.test(k));
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

  // Prüfrunde w01-04: after skipping releases the popup lists only this one's points; the link then names the gap.
  const sinceText = (L) => {
    const p = verParts(SEEN_BEFORE), v = verParts(VERSION);
    const skipped = p && v && verCmp(SEEN_BEFORE, VERSION) < 0 && !(p[0] === v[0] && p[1] === v[1] && p[2] >= v[2] - 1);
    return skipped && L.allSince ? L.allSince.replace("{version}", String(SEEN_BEFORE).replace(/b\d+$/, "")) : L.all;
  };
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
      ${mode === "welcome" ? "" : `<a class="cw-all" href="${CHANGELOG_URL.replace(/\.md$/, String(lang || "").toLowerCase().split(/[-_]/)[0] === "de" ? ".de.md" : ".md")}" target="_blank" rel="noreferrer">${esc(sinceText(L))}</a>`}
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
