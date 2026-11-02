<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-title-dark.webp" />
  <img src="docs/images/readme-title-light.webp" alt="Casora: Your home. At ease. The home view on a desktop with a house photo, weather, status badges and device tiles." />
</picture>

<p>A calm, photo-backed dashboard that sets itself up.<br/>
Shape the rest room by room in a visual studio. No YAML.</p>

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FSH1FT-W%2Fcasora%2Fmain%2Fcustom_components%2Fcasora%2Fmanifest.json&query=%24.version&label=version&style=flat-square&color=94603B&labelColor=3A322B)](https://github.com/SH1FT-W/casora/releases/latest)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.9%2B-94603B?style=flat-square&labelColor=3A322B&logo=homeassistant&logoColor=white)](https://www.home-assistant.io)
[![HACS](https://img.shields.io/badge/HACS-custom-94603B?style=flat-square&labelColor=3A322B)](https://hacs.xyz)
[![License](https://img.shields.io/badge/license-MIT-94603B?style=flat-square&labelColor=3A322B)](LICENSE)

<p><a href="https://sh1ft-w.github.io/casora"><b>Website</b></a> &nbsp;·&nbsp; <a href="#new">New</a> &nbsp;·&nbsp; <a href="#layouts">Layouts</a> &nbsp;·&nbsp; <a href="#popups">Popups</a> &nbsp;·&nbsp; <a href="#studio">Studio</a> &nbsp;·&nbsp; <a href="#look">Designs</a> &nbsp;·&nbsp; <a href="#privacy">Privacy</a> &nbsp;·&nbsp; <a href="#install">Install</a> &nbsp;·&nbsp; <a href="#thanks">Thanks</a> &nbsp;·&nbsp; <a href="CHANGELOG.md">Changelog</a></p>

</div>

<br/>

<a id="new"></a>
<sub><b>JUST ARRIVED</b></sub>
## New popups. One calm dial.

Since 26.11 every popup follows one design: what you came for sits large in the middle, the rest in short lists beside it. Settings live in the Studio, not in the popup. Your feedback shaped every release since.

<!-- cards:new -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tune-dark.svg"><img src="docs/images/icons/tune-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>New popups with a dial</b> <code>26.11.1</code><br>Every popup is built the same way: a slim header that says what is going on, then one main thing, usually a large dial. Turn it for brightness, temperature, position or volume. Scenes, modes and programs sit around it as round buttons.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/thermometer-dark.svg"><img src="docs/images/icons/thermometer-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Weather and climate</b> <code>26.11.1</code><br>A new weather popup: the dial runs from today's low to today's high, the middle shows the feels-like temperature, next to it the next hours and 7 days. The climate badges open a dial for temperature, humidity or air quality.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/palette-outline-dark.svg"><img src="docs/images/icons/palette-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>The ring shows the light</b> <code>26.11.4</code><br>Lamps that support colour get Color next to Warm, Neutral and Cold. The dial's ring takes the lamp's colour, and a room with lamps in different colours blends them. Lamps with effects get an Effects button.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/cellphone-dark.svg"><img src="docs/images/icons/cellphone-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Search your home</b> <code>26.11.2</code><br>On the phone, pull down on Home to search rooms, devices and scenes, switch a device right in the list or start a scene. On the desktop, Cmd+K or Ctrl+K opens the same search.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/cctv-dark.svg"><img src="docs/images/icons/cctv-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Bigger, clearer, quicker</b> <code>26.11.5</code><br>Tap the camera picture for a big live view, move through a song with the seek bar, flip switches right in the popup, and read the history with how long each state lasted.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/history-dark.svg"><img src="docs/images/icons/history-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Export and import</b> <code>26.11.2</code><br>Save a dashboard as a file, with photos and settings if you like, and pass it on. On import Casora shows a preview, maps missing devices and asks before it replaces anything.</td></tr>
</table>
<!-- /cards:new -->

Also new since 26.10.31: the **fridge** card, the **chart** card with lines, bars and a heatmap, the **Universal tile** and **own badges** that open a popup you assemble yourself, a **shopping list** for Bring! with **recipes** from Cookidoo, the **kettle**, the **alarm** with every mode as a button, and a calm **update prompt** when a new Casora is out.

Missing a card for one of your devices? Request it in the Studio under **Community**. It may become a card for everyone.

Every change, release by release, in the [changelog](CHANGELOG.md).

<br/>

<a id="setup"></a>
<sub><b>SETUP</b></sub>
## It already knows your home.

Casora reads Home Assistant's device registry, puts every device into its room and groups what belongs together. Your first dashboard is ready before you have touched a single tile.

The setup assistant in Casora Studio walks you through it: pick a look, let Casora sort your devices into rooms, check the preview and create your dashboard.

- **0** lines of YAML to get started. Everything is set up in the Studio.
- **31** room types with their own photos, for day and for night.
- **30** versions kept for every dashboard, ready to restore.

<br/>

<a id="layouts"></a>
<sub><b>DESKTOP, TABLET, PHONE</b></sub>
## One home. Three screens.

Every screen gets a layout made for it. Not a shrunken copy.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-screens-dark.webp" />
    <img src="docs/images/readme-screens-light.webp" alt="Casora on three screens side by side: a bedroom on a desktop display, the home view on a wall tablet and the phone layout." />
  </picture>
</p>

<!-- cards:layouts -->
<table>
<tr><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/monitor-dark.svg"><img src="docs/images/icons/monitor-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Desktop</b><br>Room by room. A full photo of each room, with its devices right below and every room one tap away.</td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tablet-dark.svg"><img src="docs/images/icons/tablet-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Wall tablet</b><br>Made for the hallway. Large tiles, readable from across the room, and a look that stays calm all day.</td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/cellphone-dark.svg"><img src="docs/images/icons/cellphone-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Phone</b><br>Your favourites first, a navigation bar under your thumb. Tiles can grow while something is going on and shrink again after.</td></tr>
</table>
<!-- /cards:layouts -->

<br/>

<a id="popups"></a>
<sub><b>POPUPS</b></sub>
## Tap a tile. One thing first.

Every popup answers the question you opened it for at a glance. A slim header says what is going on, in words. Below it one main thing, usually a large dial, with scenes and modes as round buttons around it and a single history chart where it helps. Lists sit beside it on the desktop and below it on the phone. Settings stay in the Studio, so the popup stays calm.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-popups-dark.webp" />
    <img src="docs/images/readme-popups-light.webp" alt="The lighting popup on a desktop display and on a phone: a large dial with the average brightness of the lamps that are on, Warm, Neutral, Cold and Color below it, and every room with its lights and a switch." />
  </picture>
  <br/><sub><b>Every light in the home on one dial.</b> Turn the ring for brightness, pick a white tone or a colour, switch rooms on and off beside it.</sub>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-popups2-dark.webp" />
    <img src="docs/images/readme-popups2-light.webp" alt="The weather popup on a desktop display and on a phone: a dial from today's low to today's high with the current temperature in the middle, the outdoor temperature of the last 48 hours, the next hours and 7 days." />
  </picture>
  <br/><sub><b>Weather on a dial.</b> Today's low and high as the ends of the ring, the next hours, 7 days and the last 48 hours of outdoor temperature.</sub>
</p>

<!-- cards:popups -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tune-dark.svg"><img src="docs/images/icons/tune-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Turn</b><br>Lights, heating, thermostats, blinds, fans, purifiers and media volume. Drag the knob, or tap − and + for a temperature.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/timer-outline-dark.svg"><img src="docs/images/icons/timer-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Progress</b><br>Washer, dryer, dishwasher, 3D printer, robot vacuum and mower, coffee machine, car and e-bike: how far, and when it is done.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/shield-home-outline-dark.svg"><img src="docs/images/icons/shield-home-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Segments</b><br>Security, doors and windows, locks, batteries and updates. Every item is a piece of the ring, green when all is well.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/auto-fix-dark.svg"><img src="docs/images/icons/auto-fix-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Moons</b><br>Scenes, modes and programs as round buttons around the dial. With more than four, the last one opens the rest right there.</td></tr>
</table>
<!-- /cards:popups -->

Cameras, doorbells, Frigate, the calendar, waste collection, football and lists keep their picture or table.

<br/>

<a id="hold"></a>
<sub><b>PRESS AND HOLD</b></sub>
## Hold a tile. Everything is right there.

The everyday actions should not need a popup. Press and hold any tile and a small menu opens right at the tile, a bottom sheet on the phone, a right-click on the desktop.

<!-- cards:hold -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/gesture-tap-hold-dark.svg"><img src="docs/images/icons/gesture-tap-hold-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>The quick menu</b><br>The main action on top: turn off, unlock, pause. Below it brightness and colour, position, temperature, volume. Then history, the device, its page in Home Assistant and Edit tile.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/timer-outline-dark.svg"><img src="docs/images/icons/timer-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Timers</b><br>Turn off in 30 minutes or on for 2 hours. The tile shows a ring that empties over time. Timers survive a restart and step aside when you switch by hand.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/arrow-left-dark.svg"><img src="docs/images/icons/arrow-left-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>It stays in Casora</b><br>A reading opens its chart with 24 hours, 7 or 30 days. A light, door or window shows its history with how long each state lasted. Each with a back arrow, not Home Assistant's dialog.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/help-circle-outline-dark.svg"><img src="docs/images/icons/help-circle-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Ask first, then switch</b><br>Any tile can ask before it switches. Unlock, Open door and the alarm always ask. When you arm the alarm, Casora names open windows and doors.</td></tr>
</table>
<!-- /cards:hold -->

<br/>

<a id="tiles"></a>
<sub><b>TILES</b></sub>
## Everything in your home. Already covered.

Casora picks the right tile and popup for each device on its own, with the integrations you already have.

<!-- cards:tiles -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/home-outline-dark.svg"><img src="docs/images/icons/home-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Every home</b><br>Lights and light groups, switches, scenes, blinds and covers, locks, thermostats and room climate, fans, air purifiers, humidifiers, media players, cameras and doorbells.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/shield-home-outline-dark.svg"><img src="docs/images/icons/shield-home-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Safety</b><br>Alarm system, doors and windows, smoke, water and gas sensors, official warnings.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/lightning-bolt-outline-dark.svg"><img src="docs/images/icons/lightning-bolt-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Energy and house</b><br>Energy with solar and home battery, weather and warnings, batteries of all devices, network, updates, waste collection, calendar, Pulse.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/washing-machine-dark.svg"><img src="docs/images/icons/washing-machine-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Appliances</b><br>Washing machine, dryer, dishwasher, fridge and freezer, coffee machine, kettle, robot vacuum, robot lawn mower, 3D printer.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/car-outline-dark.svg"><img src="docs/images/icons/car-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>On the road</b><br>Car with its own picture and fuel prices nearby, e-bike.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/flower-outline-dark.svg"><img src="docs/images/icons/flower-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Hobbies</b><br>Plants, aquariums, football, game activity (PlayStation, Steam, Discord), recipes and meal plan, shopping list.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/account-group-outline-dark.svg"><img src="docs/images/icons/account-group-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Community cards</b><br>Frigate camera, Reolink doorbell, Velair thermostat, chart, pet tracker, Bring! shopping list, kettle. They wait in the Studio until you add them.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/puzzle-outline-dark.svg"><img src="docs/images/icons/puzzle-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Your own</b><br>The Universal tile and own badges, each with a popup you assemble, entity lists, and any Home Assistant card as a custom tile.</td></tr>
</table>
<!-- /cards:tiles -->

### Community cards

Community cards ship with Casora, but they only appear in **Add a tile** once you add them in the Community, so your tile list stays short. Every card has a preview of its tile and popup. Removing a card asks whether tiles that use it stay or go. Nothing is downloaded from outside your Home Assistant: a new Community card comes with a Casora release. If a card is ever retired, it disappears from **Add a tile** first while existing tiles keep working, and only a later release removes it.


<details>
<summary><b>Request a card and follow it</b></summary>
<br/>

**Request a card.** In the Studio, open **Community** in the toolbar (on a phone: **⋯** › **Community cards…**) and choose **Request a card…**. Describe the device and what the tile and popup should show, and pick a few example entities. Casora prepares a GitHub issue for you and shows you the exact text before anything is sent. It contains the kind of device, units, device classes and attribute names, but no entity names, rooms or places. You submit it on GitHub yourself.

**Follow it.** Under **Your requests** in the Community the Studio shows where each request stands:

| State | Meaning |
|---|---|
| Open | Received, not picked up yet |
| Question | Something is unclear, the answer from the Casora team is shown right there |
| In progress | The card is being built |
| Built | The card ships with the next Casora release |
| Declined | Not planned, with the reason |

</details>

<br/>

<a id="studio"></a>
<sub><b>CASORA STUDIO</b></sub>
## Design it. Don't code it.

A visual editor in the Home Assistant sidebar. Rooms, tiles, badges and popups, changed in place with a live preview for desktop, tablet and phone. Tap anything in the preview and change it right beside it. Press and hold to try the real popup.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-studio-dark.webp" />
    <img src="docs/images/readme-studio-light.webp" alt="Casora Studio on a desktop display: the tile editor next to a live preview of the dashboard and the tile's popup." />
  </picture>
  <br/><sub><b>Casora Studio.</b> Rooms, tiles, badges and popups, edited in place. Nothing is written until you click Save.</sub>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-tools-dark.webp" />
    <img src="docs/images/readme-tools-light.webp" alt="Two Studio assistants, each on a desktop display: the device assistant placing new devices, and the move assistant bringing a Hemma dashboard over." />
  </picture>
  <br/><sub><b>Assistants for the tedious part.</b> Place new devices, move from Hemma, go back to any version.</sub>
</p>

<!-- cards:studio -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/eye-outline-dark.svg"><img src="docs/images/icons/eye-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>See it before you save</b><br>Switch the preview between desktop, tablet and phone. Nothing is written until you click Save, and a draft survives a reload.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/history-dark.svg"><img src="docs/images/icons/history-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Go back in time</b><br>Every save becomes a version. Preview any earlier one and restore it with a click. Nothing is ever lost.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/auto-fix-dark.svg"><img src="docs/images/icons/auto-fix-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>New devices find their place</b><br>The device assistant spots what is new in your home and suggests the room and the tile. You decide.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tune-dark.svg"><img src="docs/images/icons/tune-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Hold is configurable</b><br>Under Settings, Controls, Hold on tiles picks what press and hold does: quick menu, popup or Home Assistant dialog, for all tiles or one.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tune-dark.svg"><img src="docs/images/icons/tune-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Settings by topic</b><br>One Settings page with a search and six topics: Look & feel, Messages, Home & Devices, Weather & climate, Controls, Extras. Hold on tiles, the order of security and climate, the phone search and the update prompt are all there.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/help-circle-outline-dark.svg"><img src="docs/images/icons/help-circle-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>How do I …?</b><br>Help in the Studio with short guides for the everyday tasks, such as a waste tile, a room photo, a new device or a new order, and a Show me that points to the right spot.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/history-dark.svg"><img src="docs/images/icons/history-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Export, import, copy</b><br>Save a dashboard as a file and import it elsewhere, with a preview and missing devices mapped. Copy a dashboard or duplicate a tile in one step.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/account-group-outline-dark.svg"><img src="docs/images/icons/account-group-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Request a card</b><br>Missing a device? Request a card in the Community and follow where it stands right in the Studio.</td></tr>
</table>
<!-- /cards:studio -->

<br/>

<a id="look"></a>
<sub><b>THREE DESIGNS</b></sub>
## Soft by day. Warm by night.

Warm linen, generous corners and gentle shadows, set in Inter. All three designs come in light and dark and follow Home Assistant's theme mode.

<!-- cards:looks -->
<table>
<tr><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/palette-outline-dark.svg"><img src="docs/images/icons/palette-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Casora</b><br>The default. Warm linen and sand, large corners, soft shadows.</td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/weather-fog-dark.svg"><img src="docs/images/icons/weather-fog-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Casora Nebel</b><br>The same calm design in cool grey with a petrol accent.</td><td width="33%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/blur-dark.svg"><img src="docs/images/icons/blur-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Casora Glas</b><br>Frosted glass over your room photos. In performance mode the glass turns opaque for older tablets.</td></tr>
</table>
<!-- /cards:looks -->

<details>
<summary><b>The three designs in pictures</b></summary>
<br/>

<p align="center">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/design-casora-dark.webp" /><img src="docs/images/design-casora-light.webp" width="32%" alt="The Casora design: warm linen tiles on a desktop display and a phone." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/design-nebel-dark.webp" /><img src="docs/images/design-nebel-light.webp" width="32%" alt="The Casora Nebel design: cool grey tiles with a petrol accent." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/design-glas-dark.webp" /><img src="docs/images/design-glas-light.webp" width="32%" alt="The Casora Glas design: frosted glass tiles over the room photo." /></picture>
<br/><sub>Casora, Casora Nebel and Casora Glas.</sub>
</p>

</details>

<br/>

<a id="hemma"></a>
<sub><b>COMING FROM HEMMA</b></sub>
## Moving feels like an update.

Casora finds your Hemma dashboards, both Hemma 1 (YAML) and Hemma 2 (Hemma Studio), and carries over rooms, tiles, the phone layout and your own cards. Your old dashboard stays untouched.

1. **Make a backup** in Home Assistant, just to be safe.
2. **Install Casora** and open the Studio. It lists everything that will move.
3. **Choose** for each tile you changed: keep yours, take Casora's, or let AI merge the two.

Your own JS modules, customised popups and folders your automations write to are kept as they are. Casora builds a new dashboard next to your old one and saves a copy of the original first. Your Hemma dashboard stays untouched until you choose to hide it. Step by step in the [guide](docs/guide.md#moving-from-hemma).

<br/>

<a id="install"></a>
<sub><b>INSTALL</b></sub>
## Three steps. Then it's yours.

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=casora&category=integration"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open the Casora repository in HACS." /></a>

1. **Add the repository.** Click the button above, or in HACS open the menu, choose **Custom repositories** and add `https://github.com/SH1FT-W/casora` with the type **Integration**.
2. **Download Casora**, together with UIX and button-card if you don't have them yet, then **restart Home Assistant** once.
3. **Add the integrations** under Settings, Devices & services, Add integration: **Casora**, and **UI eXtension** if it isn't added yet. UIX does nothing until it is added there. Then open **Casora Studio** in the sidebar. The setup assistant takes it from there.

Updates arrive through HACS like any other integration. After an update, Casora brings your dashboards up to its new templates and saves a version first, so you can always go back. It never restarts Home Assistant on its own.

### What you need

| Requirement | Notes |
|---|---|
| **Home Assistant 2026.9** or newer | Required, with dashboards in storage mode (the default). |
| [**UI eXtension (UIX)**](https://github.com/Lint-Free-Technology/uix) | Required, from HACS. The successor to card-mod. After downloading, restart and add it under Settings, Devices & services, Add integration, **UI eXtension**. Use it instead of card-mod, not both. |
| [**button-card**](https://github.com/custom-cards/button-card) | Required, from HACS. |
| An **AI task** in Home Assistant | Optional, for the [AI features](docs/guide.md#ai-features-optional). |

Casora checks all of this when you first open the Studio and links you to anything missing. Casora creates its helpers and registers its dashboard resources itself; its actions and designs come with the integration, so nothing is written into your configuration.

<details>
<summary><b>Without HACS</b></summary>
<br/>

1. Download the [latest release](https://github.com/SH1FT-W/casora/releases) and copy its `custom_components/casora` folder into `/config/custom_components/` on your Home Assistant.
2. Install UIX and button-card if you don't have them yet, then **restart Home Assistant**.
3. Add the **Casora** and **UI eXtension** integrations and open **Casora Studio** in the sidebar, as above.

To update, replace the folder with the new release and restart. Without HACS, new versions show up under Settings, Updates in Home Assistant. Step by step in the [guide](docs/guide.md#install).

</details>

### Versions

Since October 2026 Casora uses calendar versions **`YY.M.N`**: year, month, and the number of the release within that month. `26.10.31` is the 31st release of October 2026. Every release, feature or fix, gets the next number; there are no separate patch or minor versions. The jump from 1.6.0 was intended: HACS and the Casora update see the new version as usual.

### Documentation

- [**Guide**](docs/guide.md): setup assistant, Studio, looks, moving from Hemma, rewind, AI features, FAQ and troubleshooting, actions
- [**Advanced YAML**](docs/ADVANCED.md): building and tuning Casora dashboards by hand
- [**Contributing**](docs/contributing.md): pull requests and screenshots
- [**Changelog**](CHANGELOG.md): what changed in each version, in English and [German](CHANGELOG.de.md)

Found a bug or have an idea? [Open an issue](https://github.com/SH1FT-W/casora/issues). For a bug, add the diagnostics from the Studio (⋯ → **Help…** → **Copy diagnostics…**): versions and counts only, no names.

<br/>

<a id="privacy"></a>
<sub><b>PRIVACY</b></sub>
## It stays at home.

- **No cloud.** Casora runs entirely inside your Home Assistant. No account, no analytics, no telemetry.
- **Your data, your backups.** Dashboards, versions and settings live on your own instance and are part of its regular backups.
- **AI only if you ask.** AI features stay off until you turn them on, and then use the provider you already set up in Home Assistant.

Casora only reaches outside for AI features you turn on (through the provider you configured, and for the AI update check the release notes of pending updates), for integration logos from `brands.home-assistant.io`, to look for new Casora releases on GitHub and, if you use them, for fuel prices, the football table and the status of your card requests. Updates come through HACS or the release page. The full list is in the [guide](docs/guide.md#privacy-in-detail).

### Optional, and quietly useful

With an AI task set up in Home Assistant, Casora can place devices that have no room, name tiles, and adapt your own cards to its look. On the dashboard it adds a few helpers: an energy coach, a heating coach, a ventilation coach, camera descriptions, a plant doctor, an aquarium doctor, a bike check, an update check against your setup and a recipe of the week.

AI runs on your own provider account. Before each AI step in the Studio, Casora shows a cost estimate. Each feature has its own schedule (off, automatic or a time you pick), and on a new install all of them start switched off. Without an AI task, these features simply stay off. More in the [guide](docs/guide.md#ai-features-optional).

<br/>

<a id="thanks"></a>
<sub><b>HALL OF FAME</b></sub>
## Made better by you.

Casora gets better with every bug report and every idea. A big thank you to everyone who tests, reports and keeps asking for more:

- [**@stalakerob**](https://github.com/stalakerob): the most reports of all. The chart card and its heatmap, the Universal tile, own badges with their own popups, the energy flow, entity lists, Frigate streams and the room search.
- [**@srsly88**](https://github.com/srsly88): from the very first issue on. Fuel prices, plants, waste and the phone layout, and lately a sharp eye on every corner of the new popups.
- [**@Westerloer**](https://github.com/Westerloer): navigation, energy, blinds, climate, network and the history, always with clear steps to reproduce.
- [**@vitidron**](https://github.com/vitidron): tireless testing of the Reolink doorbell, plus the Tractive, dishwasher and script button wishes.
- [**@andreasgoetzke**](https://github.com/andreasgoetzke): the feels-like temperature, the weather curves and the e-bike live battery.
- [**@gekberlin**](https://github.com/gekberlin): the thermostat and Velair extensions, the calendar card and the wish for clear robot vacuum errors.
- [**@chrischtili**](https://github.com/chrischtili): copying whole dashboards, scripts on a tile and the Bring! shopping list.
- [**@customstudioyandexru**](https://github.com/customstudioyandexru), [**@dnestico**](https://github.com/dnestico): the kettle card, Cyrillic room names and the wish that started the Frigate card.

Found something or missing a card? [Open an issue](https://github.com/SH1FT-W/casora/issues/new/choose). You might be next on this list.

<br/>

<sub><b>CREDITS</b></sub>
## Built on Hemma

Casora is built on [Hemma](https://github.com/willsanderson/Hemma) by [Will Sanderson](https://github.com/willsanderson), which grew out of [Homio](https://github.com/iamtherufus/Homio) by [@iamtherufus](https://github.com/iamtherufus). Thank you both.

Casora is an independent project and is not affiliated with Home Assistant or Nabu Casa. Released under the [MIT License](LICENSE). The original Hemma copyright notice is kept.

<br/>

<div align="center">
  <sub>A <a href="https://sh1ft-w.github.io"><b>SH1FT-W</b></a> project &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/flode">FLODE</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/pulse">Pulse</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/evenlight">Evenlight</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/agentbar">AgentBar</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/sharemount">ShareMount</a> &nbsp;·&nbsp; Built with <a href="https://claude.ai">Claude</a></sub>
</div>
