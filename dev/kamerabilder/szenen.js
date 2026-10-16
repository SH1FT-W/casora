// Kamerabilder der Testhaus-Kameras (dev/casora_mock: Frigate „Testhof“, Reolink-Testklingel), selbst gezeichnet.
// hof(P, o) 1280×720 und tuer(P, o) 1280×960 bauen die Szene als SVG; P = Farbtafel je Stimmung, o = Objekte
// ({person, cat}). Die Nachbearbeitung (Kameralook, Nachtsicht) macht render.mjs im Canvas.
// Stimmungen: daemmerung = Abendlicht (A), tag = Kameralook Tag (B), nacht = Nachtsicht/IR (C).

const PAL = {
  // Dämmerung – Abendlicht, weich, plastisch
  daemmerung: {
    sky0: '#2f3f6b', sky1: '#9b7d93', sky2: '#f2b981', sun: '#ffd9a0', sunA: .85,
    far: '#40513f', far2: '#55684d', farHi: '#c99a6a', house: '#8a7568', houseRoof: '#5a4440', winLit: '#ffcf7a',
    hedge: '#3c5636', hedgeHi: '#7d8f4c', lawn0: '#6c7f45', lawn1: '#3f5a33', drive: '#b49b88', drive1: '#8a7a70',
    joint: 'rgba(70,50,40,.28)', curb: '#d7c2ab', wall: '#efd3b0', wallShade: '#b99c8c', roof: '#5b3f3b', roofEdge: '#3b2828',
    eave: '#2a2224', car: '#9e2f35', carHi: '#c8494c', carDark: '#5e1c22', glass: '#2c3346', glassHi: 'rgba(255,214,170,.55)',
    tail: '#ff4a3d', tailGlow: .8, plate: '#f4efe6', tire: '#1d1b1e', bark: '#4a3528', crown: '#4b6a3a', crownHi: '#9aa75a',
    shadow: 'rgba(52,34,70,.42)', longShadow: 1, lamp: '#ffd08a', lampA: .9, bin0: '#3a4a3e', bin1: '#4a4040',
    bike: '#2d3a52', flower1: '#e07a5f', flower2: '#f2cc8f', haze: '#f6c99a', hazeA: .35, warm: .22, gate: '#3a2f2c',
    // Tür
    canopy: '#4b3d3a', canopyLight: '#ffe0a8', facade: '#e7cfb0', facadeShade: '#a88c7e', street: '#7d6f6c', sidewalk: '#b9a596',
    step: '#c9b6a2', riser: '#8e7b70', porch: '#a8968a', porchLine: 'rgba(70,50,40,.25)', mat: '#5b4637', matLine: '#7a604c',
    box: '#c7955e', boxDark: '#9c6f43', tape: '#e8d3a8', pot: '#b86b4b', mailbox: '#2e3135', fence: '#4b3a34', door: '#3e4a5a',
    skin: '#e3b393', hair: '#3b2a24', jacket: '#2f6f6a', jacketHi: '#5aa39a', pants: '#2c2f3c', shoe: '#1c1b20', fur: '#c27a3f', furDark: '#8a5126',
  },
  // Tag – Tageslicht, danach Kameralook (render.mjs)
  tag: {
    sky0: '#a9bfd2', sky1: '#d4e0e8', sky2: '#eef1ef', sun: '#ffffff', sunA: .25,
    far: '#55704a', far2: '#6a8456', farHi: '#8ea36c', house: '#c7bfb5', houseRoof: '#6d5d58', winLit: '#5d6b78',
    hedge: '#4e6a40', hedgeHi: '#7d9658', lawn0: '#88a061', lawn1: '#6a8a4a', drive: '#a7a39d', drive1: '#8f8b86',
    joint: 'rgba(60,60,60,.22)', curb: '#c9c5bd', wall: '#ddd7cc', wallShade: '#b9b2a6', roof: '#6b5a54', roofEdge: '#4a3f3c',
    eave: '#3b3634', car: '#3b5f8a', carHi: '#6f8fb3', carDark: '#22374f', glass: '#3c4652', glassHi: 'rgba(255,255,255,.28)',
    tail: '#c8352f', tailGlow: 0, plate: '#f1f1ec', tire: '#222', bark: '#5b4636', crown: '#5a7a45', crownHi: '#8eaa62',
    shadow: 'rgba(30,35,40,.30)', longShadow: 0, lamp: '#f5f1e6', lampA: 0, bin0: '#3f5446', bin1: '#55504c',
    bike: '#b33a3a', flower1: '#d9644d', flower2: '#e9c46a', haze: '#e6ecef', hazeA: .45, warm: 0, gate: '#3b3b3b',
    canopy: '#57504c', canopyLight: '#f5efe2', facade: '#e2dccf', facadeShade: '#b8b0a3', street: '#8a8783', sidewalk: '#bdb8b0',
    step: '#c3beb5', riser: '#97928b', porch: '#a9a59e', porchLine: 'rgba(60,60,60,.2)', mat: '#4a4038', matLine: '#655749',
    box: '#c49a64', boxDark: '#9a7548', tape: '#e6d6b2', pot: '#a8634a', mailbox: '#2f3338', fence: '#5a4c44', door: '#40566b',
    skin: '#d9a98a', hair: '#4a3328', jacket: '#c4572f', jacketHi: '#e07b52', pants: '#33394a', shoe: '#222', fur: '#b8875a', furDark: '#7e5733',
  },
  // Nacht – Nachtsicht (IR): Grauwerte; Laub und Haut reflektieren IR hell, Himmel schwarz, Glas dunkel, Kennzeichen grell
  nacht: {
    sky0: '#050505', sky1: '#0b0b0b', sky2: '#161616', sun: '#000', sunA: 0,
    far: '#3a3a3a', far2: '#444', farHi: '#555', house: '#2c2c2c', houseRoof: '#1c1c1c', winLit: '#b8b8b8',
    hedge: '#a0a0a0', hedgeHi: '#acacac', lawn0: '#808080', lawn1: '#9a9a9a', drive: '#6a6a6a', drive1: '#5e5e5e',
    joint: 'rgba(0,0,0,.25)', curb: '#a0a0a0', wall: '#9a9a9a', wallShade: '#707070', roof: '#3a3a3a', roofEdge: '#1e1e1e',
    eave: '#0e0e0e', car: '#4a4a4a', carHi: '#7a7a7a', carDark: '#262626', glass: '#141414', glassHi: 'rgba(255,255,255,.10)',
    tail: '#6a6a6a', tailGlow: 0, plate: '#ffffff', tire: '#121212', bark: '#5a5a5a', crown: '#bcbcbc', crownHi: '#e2e2e2',
    shadow: 'rgba(0,0,0,.35)', longShadow: 0, lamp: '#ffffff', lampA: .9, bin0: '#3a3a3a', bin1: '#444',
    bike: '#5a5a5a', flower1: '#a8a8a8', flower2: '#b0b0b0', haze: '#000', hazeA: 0, warm: 0, gate: '#2a2a2a',
    canopy: '#1a1a1a', canopyLight: '#ffffff', facade: '#8a8a8a', facadeShade: '#4c4c4c', street: '#2e2e2e', sidewalk: '#3a3a3a',
    step: '#9a9a9a', riser: '#5e5e5e', porch: '#888', porchLine: 'rgba(0,0,0,.2)', mat: '#3a3a3a', matLine: '#4c4c4c',
    box: '#b8b8b8', boxDark: '#8a8a8a', tape: '#e0e0e0', pot: '#7a7a7a', mailbox: '#2a2a2a', fence: '#6a6a6a', door: '#3a3a3a',
    skin: '#d6d6d6', hair: '#2a2a2a', jacket: '#5e5e5e', jacketHi: '#7c7c7c', pants: '#3a3a3a', shoe: '#1a1a1a', fur: '#a6a6a6', furDark: '#7a7a7a',
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function blobs(n, x0, x1, y, rMin, rMax, fill, seed) {
  const r = rng(seed); let o = '';
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, i / (n - 1)) + (r() - .5) * 30, rr = lerp(rMin, rMax, r());
    o += `<circle cx="${x.toFixed(1)}" cy="${(y + (r() - .5) * 20).toFixed(1)}" r="${rr.toFixed(1)}" fill="${fill}"/>`;
  }
  return o;
}


// Person (Füße bei x/y, Höhe h px), wahlweise mit Paket vor dem Bauch; Katze (Pfoten bei x/y, Länge l px).
function person(P, x, y, h, box) {
  const s = h / 170;
  const arms = box
    ? `<path d="M-22,-140 L-31,-104 L-24,-94 L-17,-102 L-14,-132 Z" fill="${P.jacket}"/><path d="M22,-140 L31,-104 L24,-94 L17,-102 L14,-132 Z" fill="${P.jacket}"/>`
    : `<rect x="-29" y="-138" width="9" height="58" rx="4.5" fill="${P.jacket}" transform="rotate(6 -24 -138)"/><rect x="20" y="-138" width="9" height="58" rx="4.5" fill="${P.jacket}" transform="rotate(-8 24 -138)"/>`;
  const parcel = box
    ? `<rect x="-23" y="-114" width="46" height="30" rx="2" fill="${P.box}"/><rect x="-23" y="-114" width="46" height="6" fill="${P.boxDark}" opacity=".6"/><rect x="-3" y="-114" width="6" height="30" fill="${P.tape}"/><circle cx="-23" cy="-98" r="3.6" fill="${P.skin}"/><circle cx="23" cy="-98" r="3.6" fill="${P.skin}"/>`
    : '';
  return `<g transform="translate(${x} ${y}) scale(${s.toFixed(3)})">
 <ellipse cx="0" cy="0" rx="30" ry="6" fill="${P.shadow}"/>
 <rect x="-15" y="-84" width="13" height="82" rx="5" fill="${P.pants}"/><rect x="2" y="-84" width="13" height="82" rx="5" fill="${P.pants}"/>
 <rect x="-18" y="-7" width="17" height="8" rx="3" fill="${P.shoe}"/><rect x="1" y="-7" width="17" height="8" rx="3" fill="${P.shoe}"/>
 <path d="M-21,-78 L-23,-130 Q-21,-145 -7,-146 L7,-146 Q21,-145 23,-130 L21,-78 Z" fill="${P.jacket}"/>
 <path d="M-21,-78 L-23,-130 Q-21,-145 -7,-146 L-2,-146 L-4,-78 Z" fill="${P.jacketHi}" opacity=".45"/>
 ${arms}${parcel}
 <rect x="-4" y="-152" width="8" height="8" fill="${P.skin}"/>
 <ellipse cx="0" cy="-163" rx="11" ry="13" fill="${P.skin}"/>
 <path d="M-12,-163 Q-13,-180 0,-179 Q13,-180 12,-163 Q8,-172 0,-172 Q-8,-172 -12,-163 Z" fill="${P.hair}"/>
</g>`;
}
function cat(P, x, y, l) {
  const s = l / 60;
  return `<g transform="translate(${x} ${y}) scale(${s.toFixed(3)})">
 <ellipse cx="0" cy="1" rx="30" ry="5" fill="${P.shadow}"/>
 <path d="M-26,-14 Q-46,-20 -40,-38" stroke="${P.furDark}" stroke-width="5" fill="none" stroke-linecap="round"/>
 <ellipse cx="-4" cy="-14" rx="24" ry="11" fill="${P.fur}"/>
 <rect x="-22" y="-10" width="6" height="11" rx="3" fill="${P.furDark}"/><rect x="8" y="-10" width="6" height="11" rx="3" fill="${P.furDark}"/>
 <circle cx="20" cy="-24" r="10" fill="${P.fur}"/>
 <polygon points="13,-30 15,-41 21,-32" fill="${P.furDark}"/><polygon points="22,-32 27,-41 29,-29" fill="${P.furDark}"/>
</g>`;
}

// ── Hof / Einfahrt, 1280×720, Kamera unter der Traufe, leicht erhöht ──────────
function hof(P, o = {}) {
  const W = 1280, H = 720, FY = 292;           // FY = hinteres Ende der Einfahrt
  const dl = (y) => lerp(690, 262, (y - FY) / (H - FY)), dr = (y) => lerp(852, 1112, (y - FY) / (H - FY));
  let pav = '';
  const N = 15;
  for (let k = 1; k < N; k++) {
    const y = FY + (H - FY) * Math.pow(k / N, 1.55);
    pav += `<line x1="${dl(y).toFixed(1)}" y1="${y.toFixed(1)}" x2="${dr(y).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${P.joint}" stroke-width="${(1 + 2.2 * k / N).toFixed(2)}"/>`;
  }
  for (let j = 1; j < 6; j++) {
    const t = j / 6;
    pav += `<line x1="${lerp(690, 852, t)}" y1="${FY}" x2="${lerp(262, 1112, t)}" y2="${H}" stroke="${P.joint}" stroke-width="2"/>`;
  }
  const curb = `<polygon points="690,${FY} 682,${FY} 246,${H} 262,${H}" fill="${P.curb}"/><polygon points="852,${FY} 860,${FY} 1130,${H} 1112,${H}" fill="${P.curb}"/>`;
  // Schatten: A lange Abendschatten nach vorn rechts, B/C kurz darunter
  const L = P.longShadow;
  const carShadow = L
    ? `<polygon points="520,548 760,548 880,640 610,660" fill="${P.shadow}" filter="url(#soft)"/>`
    : `<ellipse cx="640" cy="552" rx="150" ry="26" fill="${P.shadow}" filter="url(#soft)"/>`;
  const treeShadow = L
    ? `<path d="M175,470 L215,470 L520,640 C600,700 420,720 330,690 C260,660 300,600 175,470 Z" fill="${P.shadow}" filter="url(#soft)"/>`
    : `<ellipse cx="200" cy="472" rx="120" ry="26" fill="${P.shadow}" filter="url(#soft)"/>`;
  const lampGlow = (x, y, r) => P.lampA ? `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#glow)" opacity="${P.lampA}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
 <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky0}"/><stop offset=".55" stop-color="${P.sky1}"/><stop offset="1" stop-color="${P.sky2}"/></linearGradient>
 <linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.lawn0}"/><stop offset="1" stop-color="${P.lawn1}"/></linearGradient>
 <linearGradient id="drive" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.drive1}"/><stop offset="1" stop-color="${P.drive}"/></linearGradient>
 <linearGradient id="wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.wallShade}"/><stop offset="1" stop-color="${P.wall}"/></linearGradient>
 <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.haze}" stop-opacity="${P.hazeA}"/><stop offset=".5" stop-color="${P.haze}" stop-opacity="${P.hazeA * .6}"/><stop offset="1" stop-color="${P.haze}" stop-opacity="0"/></linearGradient>
 <linearGradient id="warm" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#ffb070" stop-opacity="${P.warm}"/><stop offset=".6" stop-color="#ffb070" stop-opacity="0"/></linearGradient>
 <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.glass}"/><stop offset=".3" stop-color="${P.glass}"/><stop offset=".5" stop-color="${P.glassHi}"/><stop offset=".8" stop-color="${P.glass}"/></linearGradient>
 <linearGradient id="carBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.carHi}"/><stop offset="1" stop-color="${P.car}"/></linearGradient>
 <radialGradient id="sun" cx=".14" cy=".3" r=".5"><stop offset="0" stop-color="${P.sun}" stop-opacity="${P.sunA}"/><stop offset="1" stop-color="${P.sun}" stop-opacity="0"/></radialGradient>
 <radialGradient id="glow"><stop offset="0" stop-color="${P.lamp}" stop-opacity="1"/><stop offset=".25" stop-color="${P.lamp}" stop-opacity=".5"/><stop offset="1" stop-color="${P.lamp}" stop-opacity="0"/></radialGradient>
 <radialGradient id="crown" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${P.crownHi}"/><stop offset=".55" stop-color="${P.crown}"/><stop offset="1" stop-color="${P.crown}"/></radialGradient>
 <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
 <filter id="far"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>
<rect width="${W}" height="${FY}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#sun)"/>
<g filter="url(#far)">
 ${blobs(24, -30, 1310, 205, 46, 78, P.far, 7)}
 <rect x="0" y="205" width="${W}" height="70" fill="${P.far}"/>
 ${blobs(10, 300, 1000, 228, 30, 52, P.far2, 11)}
 <polygon points="372,210 470,150 568,210" fill="${P.houseRoof}"/>
 <rect x="386" y="208" width="168" height="62" fill="${P.house}"/>
 <rect x="408" y="222" width="22" height="26" fill="${P.winLit}"/><rect x="510" y="222" width="22" height="26" fill="${P.winLit}"/>
</g>
<rect x="0" y="0" width="${W}" height="${FY + 10}" fill="url(#haze)"/>
<rect x="0" y="252" width="${W}" height="${H - 252}" fill="url(#lawn)"/>
<!-- Hecke hinten mit Tor -->
<rect x="0" y="252" width="676" height="50" fill="${P.hedge}"/><rect x="866" y="252" width="${W - 866}" height="50" fill="${P.hedge}"/>
${blobs(18, 0, 670, 254, 14, 22, P.hedge, 3)}${blobs(12, 872, 1280, 254, 14, 22, P.hedge, 5)}
<g opacity=".35" filter="url(#far)">${blobs(18, 0, 670, 256, 10, 16, P.hedgeHi, 13)}${blobs(12, 872, 1280, 256, 10, 16, P.hedgeHi, 17)}</g>
<rect x="676" y="236" width="12" height="66" fill="${P.gate}"/><rect x="854" y="236" width="12" height="66" fill="${P.gate}"/>
<g stroke="${P.gate}" stroke-width="3">${Array.from({ length: 13 }, (_, i) => `<line x1="${692 + i * 12.6}" y1="256" x2="${692 + i * 12.6}" y2="298"/>`).join('')}<line x1="688" y1="258" x2="854" y2="258"/><line x1="688" y1="292" x2="854" y2="292"/></g>
<!-- Einfahrt -->
<polygon points="690,${FY} 852,${FY} 1112,${H} 262,${H}" fill="url(#drive)"/>
${pav}${curb}
<!-- Beet links an der Einfahrt -->
<g transform="translate(-95,0)"><path d="M250,640 C300,560 420,440 560,330 L640,330 C520,440 400,560 330,690 Z" fill="${P.bark}" opacity=".55"/>
${[[300, 600, 34], [345, 545, 30], [392, 492, 27], [440, 444, 24], [488, 400, 21], [534, 362, 18], [580, 334, 15]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.hedge}"/><circle cx="${x - r * .3}" cy="${y - r * .35}" r="${r * .55}" fill="${P.hedgeHi}" opacity=".35"/><circle cx="${x + r * .25}" cy="${y - r * .2}" r="${r * .22}" fill="${i % 2 ? P.flower2 : P.flower1}"/>`).join('')}</g>
<!-- Baum links -->
${treeShadow}
<rect x="182" y="300" width="22" height="172" rx="8" fill="${P.bark}"/>
<g>${blobs(9, 70, 320, 220, 60, 98, 'url(#crown)', 21)}</g>
<!-- Garage rechts -->
<polygon points="1050,174 1280,46 1280,660 1050,452" fill="url(#wall)"/>
<polygon points="1030,166 1280,14 1280,52 1052,180" fill="${P.roof}"/>
<polygon points="1030,166 1052,180 1052,186 1030,172" fill="${P.roofEdge}"/>
<polygon points="1110,250 1190,206 1190,300 1110,334" fill="${P.glass}"/>
<polygon points="1110,250 1190,206 1190,214 1110,258" fill="${P.wallShade}" opacity=".7"/>
${P.lampA ? `<polygon points="1110,250 1190,206 1190,300 1110,334" fill="${P.winLit}" opacity=".75"/>` : ''}
<polygon points="1218,280 1262,258 1262,600 1218,560" fill="${P.door}"/>
<circle cx="1206" cy="250" r="7" fill="${P.lamp}"/>${lampGlow(1206, 250, 90)}
<!-- Mülltonnen -->
<rect x="1058" y="368" width="34" height="70" rx="4" fill="${P.bin0}"/><rect x="1054" y="362" width="42" height="10" rx="3" fill="${P.bin0}"/>
<rect x="1098" y="380" width="36" height="74" rx="4" fill="${P.bin1}"/><rect x="1094" y="374" width="44" height="10" rx="3" fill="${P.bin1}"/>
<!-- Fahrrad an der Garage -->
<g fill="none" stroke="${P.tire}" stroke-width="5"><ellipse cx="1150" cy="560" rx="22" ry="44"/><ellipse cx="1210" cy="604" rx="24" ry="48"/></g>
<g fill="none" stroke="${P.bike}" stroke-width="6" stroke-linecap="round"><path d="M1150,560 L1180,540 L1210,604 L1170,575 Z M1180,540 L1186,522 M1176,520 L1196,524 M1150,560 L1146,512 M1136,510 L1158,508"/></g>
<!-- Poller-Leuchte -->
<rect x="675" y="226" width="14" height="12" rx="3" fill="${P.lamp}"/><rect x="852" y="226" width="14" height="12" rx="3" fill="${P.lamp}"/>${lampGlow(682, 232, 70)}${lampGlow(859, 232, 70)}
<!-- Auto, von hinten oben -->
<g transform="translate(110,-8)">
${carShadow}
<polygon points="574,318 706,318 712,334 568,334" fill="${P.carDark}"/>
<polygon points="566,334 714,334 724,386 556,386" fill="url(#carBody)"/>
<polygon points="556,386 724,386 742,432 538,432" fill="url(#glass)"/>
<polygon points="538,432 742,432 756,474 524,474" fill="url(#carBody)"/>
<rect x="520" y="470" width="240" height="72" rx="22" fill="${P.car}"/>
<rect x="520" y="470" width="240" height="14" rx="7" fill="${P.carHi}" opacity=".6"/>
<rect x="540" y="342" width="16" height="12" rx="4" fill="${P.carDark}"/><rect x="724" y="342" width="16" height="12" rx="4" fill="${P.carDark}"/>
<rect x="530" y="486" width="54" height="15" rx="6" fill="${P.tail}"/><rect x="696" y="486" width="54" height="15" rx="6" fill="${P.tail}"/>
${P.tailGlow ? `<circle cx="557" cy="493" r="40" fill="#ff5a3c" opacity=".25" filter="url(#soft)"/><circle cx="723" cy="493" r="40" fill="#ff5a3c" opacity=".25" filter="url(#soft)"/>` : ''}
<rect x="603" y="506" width="74" height="18" rx="3" fill="${P.plate}" stroke="${P.carDark}" stroke-width="2"/>
<rect x="526" y="536" width="34" height="16" rx="5" fill="${P.tire}"/><rect x="720" y="536" width="34" height="16" rx="5" fill="${P.tire}"/>
</g>
${o.cat ? cat(P, 975, 590, 70) : ''}${o.person ? person(P, 585, 452, 160) : ''}
<!-- Traufe oben links (Kamera hängt darunter) -->
<polygon points="0,0 300,0 0,84" fill="${P.eave}"/>
<polygon points="0,84 300,0 316,0 0,96" fill="${P.roofEdge}" opacity=".8"/>
<rect width="${W}" height="${H}" fill="url(#warm)"/>
</svg>`;
}

// ── Haustür, 1280×960, Klingel neben der Tür, Weitwinkel nach draußen ─────────
function tuer(P, o = {}) {
  const W = 1280, H = 960;
  const lampGlow = (x, y, r, o = 1) => P.lampA ? `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#glow)" opacity="${P.lampA * o}"/>` : '';
  // Weg-Platten von Tor (y 452) bis zur ersten Stufe (y 690)
  const pl = (y) => lerp(590, 430, (y - 452) / 238), pr = (y) => lerp(690, 850, (y - 452) / 238);
  let slabs = '';
  for (let k = 1; k < 7; k++) {
    const y = 452 + 238 * Math.pow(k / 7, 1.4);
    slabs += `<line x1="${pl(y).toFixed(1)}" y1="${y.toFixed(1)}" x2="${pr(y).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${P.joint}" stroke-width="${(1.5 + k * .4).toFixed(1)}"/>`;
  }
  slabs += `<line x1="640" y1="452" x2="640" y2="690" stroke="${P.joint}" stroke-width="2"/>`;
  let porch = '';
  for (let k = 0; k < 5; k++) { const y = 850 + k * k * 9 + k * 14; porch += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${P.porchLine}" stroke-width="2"/>`; }
  for (let j = -6; j <= 6; j++) porch += `<line x1="${640 + j * 120}" y1="842" x2="${640 + j * 190}" y2="${H}" stroke="${P.porchLine}" stroke-width="2"/>`;
  const L = P.longShadow;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
 <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky0}"/><stop offset=".55" stop-color="${P.sky1}"/><stop offset="1" stop-color="${P.sky2}"/></linearGradient>
 <linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.lawn0}"/><stop offset="1" stop-color="${P.lawn1}"/></linearGradient>
 <linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.drive1}"/><stop offset="1" stop-color="${P.drive}"/></linearGradient>
 <linearGradient id="facL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.facadeShade}"/><stop offset="1" stop-color="${P.facade}"/></linearGradient>
 <linearGradient id="facR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${P.facadeShade}"/><stop offset="1" stop-color="${P.facade}"/></linearGradient>
 <linearGradient id="porch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.porch}"/><stop offset="1" stop-color="${P.riser}"/></linearGradient>
 <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.haze}" stop-opacity="${P.hazeA}"/><stop offset="1" stop-color="${P.haze}" stop-opacity="0"/></linearGradient>
 <radialGradient id="sun" cx=".2" cy=".28" r=".45"><stop offset="0" stop-color="${P.sun}" stop-opacity="${P.sunA}"/><stop offset="1" stop-color="${P.sun}" stop-opacity="0"/></radialGradient>
 <radialGradient id="glow"><stop offset="0" stop-color="${P.lamp}" stop-opacity="1"/><stop offset=".25" stop-color="${P.lamp}" stop-opacity=".5"/><stop offset="1" stop-color="${P.lamp}" stop-opacity="0"/></radialGradient>
 <radialGradient id="pool" cx=".5" cy="0" r="1"><stop offset="0" stop-color="${P.canopyLight}" stop-opacity="${P.lampA ? .55 : .12}"/><stop offset="1" stop-color="${P.canopyLight}" stop-opacity="0"/></radialGradient>
 <linearGradient id="box" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.box}"/><stop offset="1" stop-color="${P.boxDark}"/></linearGradient>
 <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
 <filter id="far"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="${W}" height="420" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#sun)"/>
<!-- gegenüber: Häuser und Bäume -->
<g filter="url(#far)">
 ${blobs(16, -20, 1300, 300, 40, 66, P.far, 41)}
 <polygon points="210,282 330,218 450,282" fill="${P.houseRoof}"/><rect x="226" y="280" width="208" height="96" fill="${P.house}"/>
 <rect x="256" y="300" width="30" height="34" fill="${P.winLit}"/><rect x="372" y="300" width="30" height="34" fill="${P.winLit}"/>
 <polygon points="820,268 960,196 1100,268" fill="${P.houseRoof}"/><rect x="838" y="266" width="244" height="110" fill="${P.house}"/>
 <rect x="870" y="290" width="34" height="38" fill="${P.winLit}"/><rect x="1010" y="290" width="34" height="38" fill="${P.winLit}"/><rect x="944" y="318" width="30" height="58" fill="${P.houseRoof}"/>
 ${lampGlow(640, 300, 70, .8)}<rect x="637" y="300" width="6" height="80" fill="${P.gate}"/>
</g>
<rect y="0" width="${W}" height="400" fill="url(#haze)"/>
<rect x="0" y="372" width="${W}" height="30" fill="${P.street}"/>
<rect x="0" y="398" width="${W}" height="18" fill="${P.sidewalk}"/>
<rect x="0" y="414" width="${W}" height="${H - 414}" fill="url(#lawn)"/>
<!-- Hecke vorn mit Gartentor -->
<rect x="0" y="404" width="574" height="52" fill="${P.hedge}"/><rect x="706" y="404" width="${W - 706}" height="52" fill="${P.hedge}"/>
${blobs(16, 0, 570, 406, 14, 20, P.hedge, 43)}${blobs(16, 710, 1280, 406, 14, 20, P.hedge, 47)}
<g opacity=".35" filter="url(#far)">${blobs(16, 0, 570, 408, 10, 15, P.hedgeHi, 51)}${blobs(16, 710, 1280, 408, 10, 15, P.hedgeHi, 53)}</g>
<rect x="566" y="388" width="14" height="70" fill="${P.fence}"/><rect x="700" y="388" width="14" height="70" fill="${P.fence}"/>
<g stroke="${P.fence}" stroke-width="5">${Array.from({ length: 8 }, (_, i) => `<line x1="${590 + i * 15}" y1="414" x2="${590 + i * 15}" y2="452"/>`).join('')}<line x1="580" y1="420" x2="700" y2="420"/><line x1="580" y1="446" x2="700" y2="446"/></g>
<!-- Briefkasten am Tor -->
<rect x="752" y="376" width="10" height="80" fill="${P.mailbox}"/>
<rect x="728" y="350" width="58" height="40" rx="8" fill="${P.mailbox}"/><rect x="738" y="362" width="38" height="5" rx="2" fill="#000" opacity=".5"/>
<rect x="728" y="350" width="58" height="8" rx="4" fill="#fff" opacity=".12"/>
<!-- Weg -->
<polygon points="590,452 690,452 850,690 430,690" fill="url(#path)"/>${slabs}
<!-- Beete -->
<path d="M150,640 C220,560 360,500 470,500 L420,600 C330,620 230,650 150,690 Z" fill="${P.bark}" opacity=".5"/><path d="M1130,640 C1060,560 920,500 810,500 L860,600 C950,620 1050,650 1130,690 Z" fill="${P.bark}" opacity=".5"/>
${[[230, 600, 34], [300, 560, 30], [370, 528, 26], [430, 508, 20], [1050, 600, 34], [980, 560, 30], [910, 528, 26], [850, 508, 20]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.hedge}"/><circle cx="${x - r * .3}" cy="${y - r * .35}" r="${r * .55}" fill="${P.hedgeHi}" opacity=".35"/><circle cx="${x + r * .25}" cy="${y - r * .2}" r="${r * .24}" fill="${i % 2 ? P.flower2 : P.flower1}"/>`).join('')}
<!-- Stufen -->
<rect x="380" y="690" width="520" height="22" fill="${P.step}"/><rect x="380" y="712" width="520" height="28" fill="${P.riser}"/>
<rect x="320" y="740" width="640" height="24" fill="${P.step}"/><rect x="320" y="764" width="640" height="32" fill="${P.riser}"/>
<rect x="0" y="796" width="${W}" height="${H - 796}" fill="url(#porch)"/>
<rect x="0" y="796" width="${W}" height="10" fill="${P.step}"/>
${porch}
<!-- Licht vom Vordach -->
<rect width="${W}" height="${H}" fill="url(#pool)"/>
<!-- Fußmatte -->
<polygon points="520,860 760,860 790,${H} 490,${H}" fill="${P.mat}"/>
${Array.from({ length: 7 }, (_, i) => `<line x1="${520 - i * 4}" y1="${872 + i * 13}" x2="${760 + i * 4}" y2="${872 + i * 13}" stroke="${P.matLine}" stroke-width="3"/>`).join('')}
<!-- Pflanzkübel links -->
<ellipse cx="236" cy="${L ? 902 : 896}" rx="${L ? 120 : 80}" ry="16" fill="${P.shadow}" filter="url(#soft)"/>
<polygon points="182,800 290,800 276,896 196,896" fill="${P.pot}"/><rect x="176" y="792" width="120" height="14" rx="5" fill="${P.pot}"/>
${blobs(6, 170, 300, 760, 30, 44, P.hedge, 61)}${blobs(5, 180, 290, 744, 10, 16, P.hedgeHi, 63)}
<!-- Paket rechts -->
<ellipse cx="${L ? 1060 : 1010}" cy="902" rx="${L ? 140 : 90}" ry="16" fill="${P.shadow}" filter="url(#soft)"/>
<polygon points="930,820 1050,808 1096,830 976,844" fill="${P.box}"/>
<polygon points="930,820 976,844 976,912 930,886" fill="${P.boxDark}"/>
<polygon points="976,844 1096,830 1096,898 976,912" fill="url(#box)"/>
<polygon points="1010,814 1030,812 1076,834 1056,836" fill="${P.tape}"/><polygon points="1056,836 1076,834 1076,900 1056,903" fill="${P.tape}" opacity=".85"/>
<polygon points="992,858 1034,853 1034,878 992,883" fill="#fff" opacity=".8"/>
${o.person ? person(P, 640, 690, 380, true) : ''}
<!-- Hauswand links/rechts (Weitwinkelrand) mit Leuchte und Hausnummer -->
<polygon points="0,40 128,112 128,792 0,890" fill="url(#facL)"/>
<polygon points="1280,40 1152,112 1152,792 1280,890" fill="url(#facR)"/>
<rect x="1160" y="300" width="26" height="420" fill="${P.door}" opacity=".9"/>
<rect x="58" y="300" width="40" height="66" rx="8" fill="${P.gate}"/><rect x="64" y="310" width="28" height="44" rx="5" fill="${P.lamp}"/>${lampGlow(78, 332, 140)}
<rect x="1196" y="240" width="46" height="40" rx="6" fill="${P.mailbox}"/><text x="1219" y="270" font-family="Helvetica, Arial" font-size="24" font-weight="700" fill="${P.plate}" text-anchor="middle">12</text>
<!-- Vordach (Unterseite) mit Downlight -->
<polygon points="0,0 ${W},0 ${W},48 1150,116 130,116 0,48" fill="${P.canopy}"/>
<polygon points="130,116 1150,116 1150,124 130,124" fill="${P.roofEdge}"/>
<ellipse cx="640" cy="64" rx="26" ry="9" fill="${P.canopyLight}"/>${lampGlow(640, 70, 120, .7)}
</svg>`;
}

if (typeof window !== 'undefined') Object.assign(window, { PAL, hof, tuer });

