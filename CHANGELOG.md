# Changelog

Casora grew out of [Hemma](https://github.com/willsanderson/Hemma) 2.1.2 (MIT) and has been
developed independently since 26.09.2026. Hemma's earlier entries are in the Git history.
The German version is in [CHANGELOG.de.md](CHANGELOG.de.md).

## 1.1.0 – 07.10.2026

The biggest update since Casora 1.0. It brings a new Studio in which the preview itself is where you work, and a second look, "Casora Nebel". On top of that come more than 20 new features and around 200 improvements and fixes across the dashboard, popups, security and energy.

### Good to know
- An installed update is applied when Home Assistant shuts down or restarts. Until then, the Studio and your dashboards keep running unchanged on the current version.
- Newly uploaded room photos are now protected (see Security). Please upload older room photos once more so they are protected too.
- Save once in the Studio: after that, the phone dashboard also takes over the condition and settings of conditional tiles (e.g. the alarm only while away) from the desktop, and the chosen font applies on the phone as well.
- The previous Studio is still there: "…" › Help › "Open the previous Studio".

### New

#### Studio
- **The preview is where you work:** click (on a phone: tap) the title, a badge or a tile and its settings open right beside it, on a phone as a sheet from the bottom. Drag badges and tiles into place right in the preview, on a touchscreen after a long press. Every editor header shows where it sits ("Living room › Tiles").
- **Toolbar instead of sidebar:** Rooms, Content (the room with all its sections, including what the preview does not show), Dashboard (this dashboard only) and Settings (all dashboards). Menus and editors say "Applies to: …" at the top. Everything about the dashboard (switch, new, rename, icon, Rewind, phone layout, delete) is in the title menu, and "…" is "Help & extras".
- **Try it:** pressing and holding a tile or badge (on a computer also right click or Alt+click) opens the real popup, just like on the dashboard, already with your unsaved changes. A tap still edits.
- **Save without leaving:** "Save" next to "Done" (also ⌘S / Ctrl+S) saves and keeps the Studio open. Messages that wait for a save have a "Save now" button.
- **Feedback and Redo:** after every change a calm message with "Undo" appears at the bottom. New: Redo (⌘⇧Z / Ctrl+Y).
- **Change list:** "Edited · 3 changes ›" under the title lists in plain sentences what goes out on save, e.g. "Room renamed: Kitchen → Kitchen & Dining" or "Time: 12-hour clock on". Every line can be taken back and redone on its own.
- **Search (⌘K):** finds rooms, tiles, badges, scenes, settings and actions, in your own words too ("history" finds Rewind, "background" the room photo), and shows the way there. Devices without a tile can be added straight from the search.
- **Tiles start from the device:** "+" asks "What should go on the dashboard?", lists the room's devices without a tile first and picks the right tile type itself. The previous picker is under "Other tile type…". A new tile opens its editor right away and lights up briefly.
- **Device picker like in Home Assistant:** name, "Room · Device" and state, grouped by room, with search, as a sheet on the phone. Devices are named everywhere the way they are named in Home Assistant.
- **Scene from the current state:** under "Add scene" › "From the current state…" tick the room's devices, set brightness and light color right in the dialog, give it a name and a color and save a real Home Assistant scene. Lights that can't be reached are listed greyed out.
- **Visibility ("Who sees this?"):** tiles, badges and rooms can be hidden for individual Home Assistant users, on desktop and phone. "View as…" shows the preview the way another user sees it. The Studio says plainly that this only hides things and is no access protection.
- **Ask before switching:** for every tile that switches or moves something (light, plug, blind, garage door, valve, scene, script, button) the dashboard can ask first. This covers every way: tile, icon, popup buttons and position slider. For group tiles the question lists all devices, and the focus starts on "Cancel".
- **Hide rooms instead of deleting them:** a hidden room keeps all its settings in the Studio, shows an eye and sits at the top of the rooms menu with "Show". "Delete room" offers "Just hide it".
- **Arrange rooms:** drag them or use "Sort alphabetically" instead of moving them one step at a time.
- **Rewind:** has a fixed place as the clock next to Undo. Versions read as plain sentences ("Living room deleted", "Photo of Kitchen changed"), can be named and pinned (pinned ones are never cleaned up), and before restoring you see what will be lost.
- **Open on phone:** a QR code with the dashboard's address, made right in the Studio, with no password inside.
- **Rename badges:** a "Name on the badge" field for climate, lights, people, media, security, energy and scenes, on desktop and phone.
- **Quick tour** the first time you open the Studio (three hints, skippable, later under "…"), then three small next steps (photo, scene, phone) that tick themselves off.
- **New room icons** for garage, mailbox, basement, attic and terrace/balcony.
- Conditional tiles: if a different condition is stored on the phone, the tile editor says so. On save, the desktop condition then applies on the phone too.

#### Look
- **New look "Casora Nebel":** the same layout as Casora, but cool light grey instead of linen and a calm petrol blue accent, in light and dark. Pick it in the Studio under Settings › Design or in the setup assistant. Lights stay yellow, heating orange, alarms red.
- **Purple for scenes:** Casora and Casora Nebel have their own purple in the color picker. Color names follow the color the look really shows.
- **Scene colors across the dashboard:** when a scene is active, scene badges, the scenes popup and the scene menus (desktop and phone) show its color.

#### Security and alarm
- **Ask before arming:** if windows or doors are open or locks unlocked, Casora asks before arming and names up to three of them ("Heads up: Kitchen window open, Front door unlocked"). Disarming never asks.
- **Alarm popup (Casora look):** one large button says what happens ("Arm · Away", "Disarm", "Cancel" with a countdown, red "Stop alarm"), with the other modes below. If the system needs a code, a code field appears. Only modes the system supports are shown.
- **Security badge with icons:** the second line shows small icons with a count instead of a long list, "Tilted" has its own icon and unreachable devices are crossed out. New setting: "Automatic" (short on the home page, written out in rooms), "Always short" or "Always detailed".
- When everything is closed the security badge says "All secure", "Alarm!" when it goes off, and "Lock open" instead of "1 lock". This applies to Hemma 1 and Hemma 2 too.

#### Popups, energy and devices
- **Light popup of a room:** new "All off" button. The popup of a single lamp shows all lights of the room.
- **Light popup for the whole home (home page):** "All off" is here too and asks before turning everything off. Lights you cannot see stay untouched.
- **Energy popup:** the biggest consumers (up to 5) show even without picking them in the Studio. Casora finds them itself and leaves out house, grid, solar and battery values. Every sensor in a room's sum is listed with its value.
- **Assist suggestions from your home:** matched to the time of day, using your room names and starting with what needs attention right now (open window, lights on, door unlocked). Voice input uses your home's preferred Assist pipeline.
- **Aquarium tile:** new "Battery hints" setting (Automatic, Always, Never). If there is already a Batteries tile, the aquarium tile no longer reports a weak sensor battery a second time. Leaks and temperature warnings are reported as before.
- **Phone room page:** blinds and shutters have their own "Blinds" group instead of sitting under "Climate", garage doors and gates appear under "Security".
- **Vacuum map on its own:** if no map is set in the Studio, or the chosen one no longer exists, the vacuum popup finds the map on the device itself (Roborock: the map of the current floor, other integrations: a "…_map" camera). A chosen map takes precedence. The map sits fully and undistorted in its area on phone, tablet and desktop and refreshes without flicker. The Studio shows under "Map" which one was found.

### Improved

#### Studio
- The "Elements" tab is now "Content", and every tab explains in one sentence what it holds when you point at it. The look is under Settings › Design, the dashboard menu keeps "Controls". (German: "Handy" instead of "Mobil" throughout.)
- The tile editor shows the essentials first, "Visibility & ask first" and "Popup" fold away with a short summary. Switch labels can be clicked too.
- The preview names tiles like the dashboard does, tiles without their own name show their kind in small print (e.g. "3D printer"), and tiles that find their own data show "Automatic" instead of "Device missing".
- The desktop preview uses your screen's proportions. Swipe cards show as one tile with page dots. New or removed tiles appear in the phone preview right away.
- Tablet: in portrait the editor sits below the preview, which is upright and more than twice as wide. The toolbar shortens its labels step by step, the buttons stay in place and nothing overlaps with "Save".
- "New in …" lists every device in the room without a tile, including devices that only have an area.
- "Match desktop and phone" is a calm note in plain sentences instead of an orange "2 differences".
- On the phone the Studio is dark when Home Assistant is dark. Headings, Back and Close are readable, settings pages are opaque.
- Settings use switches instead of checkboxes, repeated rows show their heading only once, and desktop menus are tall enough for the whole room menu. "Save settings" is clearly apart from "Done".
- In the Casora look, Amber, Ice and Gold are no longer offered, because they looked like Orange, Blue and Yellow. Colors already chosen stay.
- Setup hints ("assign in Casora Studio") are shown to admins only, everyone else sees "Not set up yet".

#### Dashboard and popups
- Popups are fully opaque, with the same headings and spacing everywhere, and the active row looks the same everywhere.
- On the phone, buttons and tap targets are at least 44 pixels everywhere (Close, Back, switches, scene chips, color and source pills, camera full screen). Screen readers announce "Close" and "Back" in your language.
- Easier to read in the Casora look: darker start button, stronger tiles that are off, the same font sizes for the same roles, and on tablets small print is at least 13 px.
- Blinds popup: quick buttons "Close · 25 % · 50 % · 75 % · Open" with enough room, and shades, shutters and blinds share one "Blinds" group.
- Robot vacuum popup: mode buttons fill the width, nothing is cut off, programs no longer repeat the device name, and the popup is fully translated into English.
- A camera without a picture shows a calm tile with a camera icon and "No image" instead of a black tile saying "Live".
- Alarm popup: the header uses the color of the active mode (armed = fine), red only when the alarm goes off. The thermostat popup shows the same icon as its tile.
- Switchable single devices have a switch on the tile, now also the air purifier, groups do not.
- Bell: the same dot for new notifications everywhere, and the menu has a heading. Tapping an entry opens the same popup as tapping the tile.
- Room bar on a computer: with the keyboard you can see which room is selected, and a mouse click no longer leaves a frame.
- Phone: if a badge ends exactly at the screen edge, the badges get a little wider so you can tell the row goes on. Switching rooms keeps the tiles in place.
- The room energy badge counts every device (including devices with the same name and a relay's own consumption), only counts power, converts kW to W and skips unreachable sensors. A sensor you remove stays excluded, and "Add all" shows what is not counted yet.
- Ventilation: after a restart a window's open time keeps counting. Without an outdoor sensor it says "no outdoor values" instead of "more humid outside".
- Temperatures, precipitation and costs use the unit or currency of Home Assistant or the sensor (e.g. °F, inches, CHF). The AI coaches get temperatures in the right unit.
- "36 hours ago" reads "Yesterday", short uptimes show minutes instead of "0 h".
- Camera and plant AI say what is wrong when no AI is set up ("No AI set up").
- Phone, while scrolling (Casora and Nebel): a small floating pill at the top shows what matters, in a room e.g. "Bedroom · 21° · Lights off", on the home page "Home" next to the bell and menu. Tap it to jump to the top. Instead of a bar with a hard edge, content runs softly under a gentle fade; going back is in the bottom bar.

#### Translations
- English: many gaps closed, e.g. events, "New: …", updates ("2 available"), energy, recipes, pickup dates, robot vacuum, arming countdown, wind directions (NE/SE) and waste duty ("Next turn").
- Media badge: paused playback reads "1 paused" instead of "1 running". Scenes badge: "None active". Thermostat tile with your locale's decimal separator.

### Fixed

- Bell: a door or window with both a contact and a tilt sensor shows up only once, as "is tilted" or "is open" depending on its position.
- Set up automatically: a room light group that contains a subgroup without an area is used for the room again instead of a single lamp.
- "All off" in the light popup can be reached and used with the keyboard.
- "+N more" in the Rewind loss list shows a focus ring when used with the keyboard.

#### Dashboard and popups
- Heating popup: plus, minus and the temperature bar respond again (touch and mouse). With "Off" the target temperature is shown, and changing it switches to Heat.
- A thermostat in "Auto" shows "Auto · 21°" instead of "Off", and a tap turns it off instead of switching to manual heating. Without a target temperature, "undefined°" never appears.
- Floor heating: if iOS interrupts dragging the bar, the next swipe no longer changes anything. If a sensor reports no number, only that row is hidden.
- Alarm popup: the mode rows (Away, Night, Vacation, Bypass) work again. An alarm tile without an assigned device shows the same system as its popup.
- Locks: the switch is on for "Locked", and with mixed states the header says "1 unlocked". An opened lock reads "Open" with an open lock icon instead of "Blocked". On tablets the switch no longer covers the heading.
- Blinds popup: the Close/25/50/75/Open highlight follows the real position.
- Lights: holding the badge and tapping light chips open the Casora light popup with the room's real lights. The chosen white tone and light color are highlighted.
- Light popup for the whole home: the row of rooms no longer flickers when a room with several lights is turned on.
- Set up automatically: a room's "Lights" tile never uses the light group of the whole house.
- Bell: notifications without a matching tile (e.g. a plant) open the Casora popup instead of a technical Home Assistant dialog.
- Plant popup on phones: long reading names no longer push the popup wider than the screen. The plant name is left off at the front even when it is written without umlauts there, and the " 2" Home Assistant adds to duplicate names is dropped. Values on the right are always fully visible.
- Energy: "Feed-in total", meters in Wh and power in kW are shown correctly (e.g. 1.5 kWh instead of 1500 kWh, 2.5 kW instead of 3 W). The "no daily values yet" hint is fully readable.
- Media popup: buttons no longer jump when playback starts, and on an iPad in landscape controls and volume are visible without scrolling.
- Waste popup: the arrows for paging through the month calendar are no longer cut off at the top.
- Scenes without an editor config (YAML, Hue) briefly show "Active" after starting.
- Light tile: a custom popup title is shown in the popup.
- Icons from an icon set that isn't installed show a default icon instead of an empty circle.
- Voice Assist: if no answer arrives, input works again after 45 seconds.
- "Casora" look, light mode: in Home Assistant (e.g. "Add condition" in the automation editor) the unselected tabs "By type" and "Blocks" are readable again. The dashboard stays unchanged.

#### Phone
- A tile hidden in the Studio is also left out of the room page and the category pages.
- Picking a room right after loading opens it straight away. Content no longer jumps down after the light popup.
- The home page title no longer flips between "Home" and "Zuhause". After moving from Hemma 1 the overview is named like on the desktop.
- The security page loads without errors. The bell list and the rooms menu are opaque.
- In the rooms menu the highlight of the open room sits the same distance from every edge, its corners follow the menu's rounding, and the icon has as much room on the left as towards the text.

#### Studio
- No save path (assistant, new scene, settings) can overwrite a dashboard whose saving is locked any more. After a read error the Studio writes nothing.
- Changes made while saving stay marked as unsaved. ⌘S while switching dashboards no longer saves only half of it.
- Saving settings (e.g. Ventilation) no longer throws you out of the Studio, and on the phone the bar resets correctly afterwards.
- "Restore this version" asks only once and is also in the "…" menu of a version.
- Devices hidden for you no longer open from the bell or a group popup. "View as" and the security badge only count what that person can see.
- A dashboard that has since become a Casora dashboard shows up in the list within an hour. New or removed scenes appear when you return to the tab.
- The new Studio stays behind the device assistant and the YAML import. Dialogs with three buttons no longer overflow.
- A white lamp reads "white" instead of "red" in the scene dialog.
- In the "Casora" look the preview now shows the dashboard true to scale, just smaller: tiles, badges and the title keep the same proportions as on screen, and the same number of tiles fit in a row (tiles used to be too small and badges too tall).

#### Updates and background
- If installing an update fails (e.g. disk full), the running version stays intact. An installed update is not offered again.
- Without internet, Casora no longer delays startup by up to 20 seconds. If a single card update can't be downloaded, the others are still found.
- When a card update is waiting at startup, dashboards are reliably saved with the newest templates. When two dashboards save at the same time, nothing under "Versions" gets lost.
- Custom fonts with the same file name in two families no longer overwrite each other.
- The configure dialog says "Invalid input" instead of "Invalid time" for wrong values. Migration "Adapt template" explains AI changes that don't fit.
- All tiles and badges give short tap feedback, now also heating, floor heating, humidifier, air purifier, motion and presence. The target temperature plus and minus buttons visibly give way when pressed.

### Security
- Newly uploaded room photos get a file name that cannot be guessed, so nobody can fetch a photo of your home via a simple address like "livingroom.jpg". Upload older photos once more.
- The "Casora set up" and "Casora migrate" actions can only be called by administrators. After removing Casora, old automations can no longer start them.
- Users without admin rights can no longer read the layout of an admin-only dashboard through the phone room badges.
- Release notes of other integrations in the updates popup, template texts and room names in Assist suggestions are handled more safely (precaution, was not exploitable).

### Performance
- The Studio opens much faster: reopened on a phone after about 2 instead of 8 seconds, on desktop after 0.6 instead of 2 seconds. It no longer downloads every dashboard each time.
- The Studio's code and card templates are sent compressed (1.1 instead of 4.6 MB) and stay cached in the browser until Casora is updated.
- On the phone the editors respond about twice as fast, and on desktop almost every action takes under 0.1 seconds. A memory leak is fixed, so the Studio no longer slows down during long sessions.
- Room photos need only about a quarter of the data on phones and a third on desktop (WebP, scaled down for phones). Your original photos are not changed.
- Less battery and CPU use while idle, and wall tablets no longer slow down over days, because tile rows and swipe cards release their memory.

## 1.0.11 – 05.10.2026

### Improved
- Wave (Casora look, desktop/tablet): when something plays, the list below the wave opens by itself, also after reloading. If you close it yourself (wave, tapping beside it, Escape), it stays closed on this device, also after reloading, until a new playback starts. Closing by itself because nothing plays any more does not count as closed.

## 1.0.10 – 05.10.2026

### New
- Playback in the Casora look (wave at the top, phone list, media row in rooms): when several players play the same title by the same artist, they share one row, e.g. "HomePod Kitchen + Office · NICKLAS", from three players "HomePod Kitchen + 2". Play and pause control all players of the row, tapping opens the popup of the first one.
- Hide a playback: swiping a row to the left (finger or mouse) shows "Hide". The playback then disappears on this device only, until the player plays something else. When all are hidden, the wave at the top disappears too.

### Fixed
- Playback after loading: in the Casora look, clearing the cache or reloading briefly flashed the old player (desktop: tile stack below the wave, phone: media row) until the extra scripts had loaded. The templates now recognise the Casora look from the theme on the first render and hide the old player right away.
- Playback: paused players now disappear on their own once the pause timeout is reached. They used to stay in the wave and lists until some other player changed, and then the display jumped all at once. On the phone an older version of the playback logic from the template sometimes won; now the same one applies everywhere.
- Scenes "last active": days are counted by calendar day. A scene from last night now says "Yesterday" instead of "2 days ago" after 36 hours (#12, refs #11).

## 1.0.9 – 05.10.2026

### New
- Phone room page like desktop and tablet: the badges at the top of the phone room page are now the same as in the room header on desktop/tablet: security, climate, lights, people, energy and media, with the same texts, in the same order and with the same "separate or grouped" setting. Tapping a group badge opens its members below it (on this device only). The phone used to show its own, smaller selection: no energy, climate as separate readings, doors and windows only partly. This applies to all dashboards automatically with the update, without saving in the Studio, including ones moved over from Hemma. The phone preview in the Studio shows the same.
- Air quality badge (Casora look): new wind icon; moderate air adds two particles, poor air four. The circle is back to the normal level colour.

### Improved
- Phone, Casora look (light and dark): the veil over the background photo now comes from the top and reaches just below "Favorites", so the title, badges and first heading are easy to read. Below it the photo stays clear all the way down, with no linen or anthracite area at the bottom. In 1.0.8 the veil had almost faded out at "Favorites" and a light fade sat at the bottom instead. Room pages on the phone get the same fade from the top.

## 1.0.8 – 05.10.2026

### New
- Bigger weather above the room title on desktop and tablet (Casora look): temperature and icon are clearly larger, with two lines next to them showing the condition and "H 17° · L 9° · 20% rain" from the daily forecast. Without a daily forecast the second line is left out. In the Studio under Weather, "Show details" turns this off and shows only temperature and icon. The phone stays as it is, and so do Hemma 1 and Hemma 2.
- The clock at the top left is slightly larger in the Casora look (16 instead of 15 px).

### Changed
- The themes have new names: Casora's own look is now called "Casora" in your profile (was "Casora Weich"), the two classic looks "Hemma 2" (was "Casora Standard") and "Hemma 1" (was "Casora Glass"). A saved choice moves along by itself on the first start, including the choice in each browser.
- Alarm in the Casora look: "Active · Away" instead of "Active · Out", matching the Alarmo mode.
- Phone, Casora look light: the linen veil over the background photo now only runs from the top to about "Favorites"; below it the photo stays clear and only fades softly into linen at the very bottom. It used to cover the photo from top to bottom and everything looked milky. Room pages on the phone are clearer as well.
- Air quality badge (Casora look): seven large dots instead of the fine dotted graphic, growing with the pollution level, on a slightly darker circle. The old icon was hard to make out in the small circle, especially on yellow.
- AI update check: for Casora updates the AI gets the release notes handed over instead of fetching them from GitHub itself, which often ended in "release notes not available".

### Fixed
- Cameras: a camera now only counts as offline when Home Assistant reports it unavailable. Casora used to also fetch a snapshot; with slow cameras (for example Reolink, snapshots taking over 10 seconds) Home Assistant gave up, and tile, badges and popup showed "Offline" while the camera was running. The popup even covered a working live view with it.
- Robot vacuum: "finished cleaning" sometimes showed up twice in the bell after a clean with stops at the dock (mop washing), for example after a Home Assistant restart in the middle of a clean. Now each clean gets exactly one entry, at the last return to the dock.
- "Doors & windows" popup in the Casora look (light): the white rows had a square grey shadow at their bottom corners. The shadow now runs softly around the rounded corners.

## 1.0.7 – 05.10.2026

### Improved
- Weich, tile row on desktop and tablet: when more tiles lie to the right, the cut tile fades softly into the edge, and small page dots below show how much follows (tappable). Set with the theme variable `casora-row-overflow` (`fade`, `arrows` or `more`).
- Battery readings are the same everywhere: OK, Low (20 % or less), Almost empty (10 % or less), Charging and Unknown, with the same words and colours on the batteries tile and popup, the bell, locks, aquarium, robot vacuum and thermostat. The bell turns orange or red by the weakest battery instead of always red.
- Weich, popups: content cards no longer lift under the mouse, long popups keep more room at the bottom and fade out in the popup colour.
- Weich, blinds popup: head, slider and rows use the same slat icon as the tile.
- Weich, phone room page: category headings as large as "Scenes"; an empty category shows a hint instead of staying blank.
- Weich dark: switches that are off are warm grey with a cream knob instead of almost black.
- Alarm popup: mode list at full width, the switch reads "Alarm" (on = armed).
- Plant popup: lists plant readings only, no unrelated sensors.
- Recipe popup (Weich): buttons in tone and sand, a stronger title.
- Weich, tile row on desktop and tablet: the soft fade now sits fixed at the edge of the row and the tiles run underneath; it no longer travels with a tile and shows no hard shadow edge. Swiping with a trackpad or mouse wheel is smooth again: the row no longer snaps to tile edges (it pulled back on every swipe step in Chrome and stuck, then jumped after letting go in Safari; touch keeps the gentle snapping, the arrows still land on a tile edge), swiping back to the start no longer runs on into the browser's back gesture and gets stuck at the end, the fade no longer changes the tile layout mid swipe, and the row measures at most once per frame, only when tiles reorder instead of on every state change, and the "Now playing" list only moves its progress bars each second instead of rebuilding.
- Soft look, "Now playing": instead of the sideways carousel (phone) and the media pills under the badges (desktop and tablet), all players now sit in one quiet card, one row per player with cover, title, "Artist · Device", a thin progress bar that keeps running and a round play/pause button. Tapping a row opens the media popup as before. On desktop and tablet the rows stand side by side and wrap to a new line instead of scrolling sideways, so the cut-off shadow under the old player is gone too. Standard and Glass keep their look. The Studio phone preview shows the new list as well.
- Soft look, media wave at the top right (desktop and tablet): tapping the wave now opens a calm menu below it in the style of the notification menu instead of unfolding the stack of mini player tiles. Every player is one row exactly like the "Now playing" list: cover, title, "Artist · Device", a thin progress bar that keeps running and a round play/pause button in the accent colour. Long titles end with an ellipsis, a missing cover shows a note symbol. Tapping a row opens the large media popup as before; tapping beside the menu, the wave again or Escape closes it. When the last playback stops while the menu is open, it fades out by itself and the wave disappears as before. Light and dark. The phone has no wave and stays as it is; Standard and Glass keep the tile stack. The Studio desktop preview shows the open wave as the same list.
- Soft look, phone navigation bar: a compact capsule with icons only; the active destination becomes a light sand pill with its name (Home, the open room or Scenes), like the desktop room bar. Surface, shadow and blur come from the desktop room bar, and the room and scene menus match its menus (same surface, regular text, active entry in light sand). All destinations, the menus and the room switch work as before. Standard and Glass keep the bar with labels. The Studio phone preview follows.
- Soft look, buttons at the top right: same layout, buttons and "…" menu entries as before, calmer look. The phone capsule is 48 px high, the desktop circles are 40 px with 8 px spacing and stay centred on the room bar; both share the same light surface with a soft shadow and no outline or sheen. Icons are a little lighter, the divider is shorter and softer, the bell's count and dot are caramel instead of red, and the media wave (when something plays) sits in a matching circle in the accent ink. Casora's menus get 44 px rows, lightly tinted icon circles and a 24 px radius. Light and dark; Standard and Glass are unchanged.
- Waste tile and popup (Soft look): on pickup day the tile now shows the bin's colour as a full circle with a light symbol. Before, Residual waste was a grey symbol on a grey circle and almost disappeared, especially in dark mode. All waste types use the popup colours everywhere (tile, popup, 4 week calendar, calendar dots), Residual waste as a solid warm taupe per mode instead of a see-through brown. Hazardous waste gets its own red instead of the same orange as bulky waste. Adjustable via the theme variables `casora-waste-rest`, `casora-waste-bio`, `casora-waste-paper`, `casora-waste-yellow`, `casora-waste-glass`, `casora-waste-bulky`, `casora-waste-hazard`, `casora-waste-other` and `casora-waste-glyph`. Other looks are unchanged.

### Fixed
- Robot vacuum in the bell: a robot that returns to the dock in the middle of a clean (to wash the mop, empty the bin or charge) no longer reports "finished cleaning" every time it docks. If the integration says why it stopped (status such as washing the mop, emptying, drying or charging, progress below 100 %), the bell shows a running entry "Paused · washing mop" instead. A clear end (progress 100 %, a new "last clean end" time, status completed) counts at once. Without such sensors the robot counts as finished after 10 minutes at rest on the dock; if it sets off again before that, it is the same clean. Works for every brand, live and when the bell is rebuilt from the logbook; wrong entries from earlier dock stops disappear.
- Cameras: a camera that delivered no picture for a while stayed "offline" in badges even after it was back. Cameras remembered as offline are now checked again every minute and when you return to the page, and every card and badge with that camera redraws.
- Phone tile grid: a tile shown only under a condition (for example the alarm tile while armed away) was a few pixels taller than the other small tiles, so the gap to the tile below shrank. It now has exactly the row height in every look.
- Weich, security: tiles, badges, popups and the bell use the same colour, word and symbol for the same state. Green = all right (locked, closed, alarm on), orange = note (unlocked, open, alarm off, camera offline), red = danger (alarm triggered, open while away). The alarm reads friendlier and says "Active · Home", "Active · Away", "Active · Partial" (instead of bypass), "Off" and "Alarm!" everywhere, with the mode symbol on badge, tile, popup and bell; the small phone tile shows just the mode ("Away") so nothing is cut off. Lock and contact rows in the popups and the popup ring now take these colours instead of petrol or sand. Other looks are unchanged.
- Lock: tile, badge and popup say "Unlocked" or "Locked" everywhere, unlocked in the warning colour, and the popup switch matches the tile switch.
- Air purifier: modes such as "auto" or "sleep" read "Auto" and "Sleep" when Home Assistant has no translation.
- Wording: "OK" instead of "Ok", the Studio shows "1 On" like the dashboard.
- Studio: clicking the day or night segment that is already active no longer switches it.
- Waste popup with the month calendar (Soft look, desktop and tablet): both columns now end flush. The month fills the height of the right column (today, bins, putting out), and its plate starts on the same line as the day card next to it. The phone layout is unchanged.
- Soft look, Studio phone preview: climate and security badges show the same symbols as on the phone (home thermometer, orange shield when something needs attention) in a coloured circle, temperatures as "21°", and blinds tiles show slats instead of a curtain.
- Soft look, Studio popup preview: the label "Popup · …" above the preview is clearly readable in light mode.
- Soft look, Studio → Look & Controls → Design: the three designs stand side by side, names on one line, "Legacy" as a small tag below.
- Soft look, phone popups such as Thermostat or Energy: the sheet is only as tall as its content instead of always reaching the top.
- Phone tiles: shorter texts that no longer get cut off ("No sensor" for energy and solar tip without a sensor, "Recipe" as the recipe tile name).
- Soft look, weather in the title: filled weather symbol in the title colour instead of a thin grey outline.
- Soft look, weather popup: the headings "Next hours", "7 days" and the chart title sit above their surfaces like in the other popups.
- Soft look, network popup: all network symbols in the network colour (blue); the "On" of a Wi-Fi is no longer green.
- Soft look, phone room page: scrolled tiles and scenes no longer show through behind the small room title; it gets a linen surface that fades in with the title (light and dark).
- Phone home page: after a long time in the background the gap between the top bar and the "Home" line could be about 150 px too large. Casora now measures it again on return and fixes the layout on its own (reloading once if needed).

## 1.0.6 – 04.10.2026

### New
- Phone, room page: tiles are grouped by category, like in Apple's Home app: Lights, Climate (heating, floor heating, air purifier, fan, blinds), Security, Speakers & TVs, Water and Other, each with a small heading. Within a group the Studio order stays. Rooms with up to 3 tiles or only one kind of device stay as before, without headings. Studio → Look & Controls → Phone: "Group rooms by category on the phone" (on by default) switches it off per dashboard. The phone preview in the Studio shows the groups too and follows the switch right away.

### Fixed
- Security badge: A camera reported as ready but delivering no picture (for example through a proxy) counted as fine in the badge while the camera card already showed "Offline". The badge now reports it as offline too, including the separate camera badge in a room.

### Improved
- Aquarium popup: the German heading of the leak and temperature sensor batteries now reads "Sensoren" instead of "Fühler".
- Dashboard, "…" menu: "Refresh" and "Reload (clear cache)" are now one "Refresh" entry that always clears Casora's cache when it reloads.
- Phone room view (Soft look): more room between the badge row under the room name and the first row of tiles (40 px instead of 24 px), so the badges no longer sit right on top of the tiles. Adjustable via the theme variable `casora-room-badges-gap-mobile`.
- Media popup on desktop and tablet (Apple TV and other players with apps): the left column (Turn off, Open Apple Music, More settings) now has its own heading "Device" in the same style as "Apps" on the right, so both columns start at the same height.

## 1.0.5 – 04.10.2026

### New
- After a Casora update, an open dashboard notices the new version by itself (when Home Assistant
  reconnects after the restart, when the tab becomes visible again, and every 10 minutes) and shows a
  quiet hint at the bottom: "Casora was updated" with "Reload". It appears once per update and can be
  closed. Reload first removes Casora's files from the browser cache, so every device really gets the
  new files; Home Assistant's own cache stays untouched.
- Dashboard, "…" menu: new entry "Reload (clear cache)" with the same function.

### Fixed
- Bell: after a Home Assistant restart, "2 updates available" showed up as new again although
  exactly these updates had already been read. Standing entries (updates, pending restart, low battery,
  safety and weather warnings, plants, appliances, appliance care) now keep the time they were first
  seen for the same content. They only count as new again when something new joins, such as another
  update or a newer version.
- Shopping list: oil now shows a bottle instead of the car oil can.
- Bell: a "finished" entry (robot vacuum, washer, dryer, dishwasher, printer) sometimes disappeared when
  the bell was opened again, although nothing was read or cleared. A finished run now stays until the
  24 hour window ends, even if the device changes state afterwards or the page is reloaded. The bell
  waits for all extensions before it collects, and it detects the end of a cleaning run even when it is
  the first change in the window, after a short device outage, or with a stateless logbook message in between.
- Bell: the same door or window was listed twice (for example "Terrassentür ist offen" two times) when
  contact, tilt sensor or combined sensor share a name and one of them has no area. One opening now
  reports once. Contacts with the same name get the room in front when they are in different rooms, and
  the device name or a number in the same room, so two identical rows never appear.
- Bell: a running appliance with remaining time jumped back under "New" right after being read.
- Bell: entries with the same time no longer swap places on refresh.
- Studio, room background photo: uploading your own photo works reliably now, by click and by dragging it
  onto the day or night slot. The new photo is selected right away and shows in the list and the preview
  without reloading the page; the example photos stay in the list, and Save keeps it. Photos up to 16 MB
  are accepted (before: 12 MB), PNG and WebP are stored as JPG so the dashboard finds them, large photos
  are scaled down to 2560 px, and iPhone photos are turned upright. File names with umlauts or spaces work,
  and the photo name is cleaned up instead of rejected. A night photo for a new name also serves by day
  until a day photo is added. HEIC files get a clear message ("export as JPG"), and every error now says
  what to do instead of showing a technical text. A replaced photo shows at once instead of the old one.
- After a Home Assistant restart, an open dashboard no longer shows the old glass look for a few seconds
  until Casora has loaded. Casora now keeps a copy of its themes in the themes folder (when configuration.yaml
  loads it with `frontend: themes: !include_dir_merge_named themes`, as in the standard setup), so Home
  Assistant knows your Casora theme from the very first second, and registers its themes first thing while loading.
### Improved
- Weich dark: The navigation bar on desktop and the top right bar (bell, Assist) no longer have a light rim.
- Weich: The round back button in rooms and areas no longer has a shiny rim, it is flat like the phone bar.
- Soft look in dark: menus opened from the bottom bar no longer have the old light rim either.
- Soft look on the phone: the bottom bar stands out clearly from the tiles (almost white in light, almost black in dark, without the old light rim).
- Soft look: aquarium charts also turn calm when the tile brings its own bright color (for example from a Hemma move).
- Soft look: a readability veil in the base colour now lies over the background photo, linen in light mode
  and the dark base tone in dark mode, so section headings, the title, badges and the weather stay readable
  on any photo. On the phone (home page, rooms, room view) it is about 66 % at the top, fading towards the
  bottom. On desktop and tablet it only sits on the left behind the title, badges and headings (about 65 %
  on the left, fading to the right), so the photo stays clear on the right. Text, cards and the navigation
  bar are unchanged and sit above it. Standard and Glass are unchanged.
- Updates popup: after installing an update that needs a restart, the open popup now rebuilds itself. The
  row leaves the available updates, “Waiting for restart” appears and the heading offers “Restart now”,
  without closing and reopening the popup. After the restart the section disappears again.
- Updates popup on the phone: “Update” on the right of each update row is now a round download button,
  so the name gets more room and the new version and AI verdict fit on one line. Tapping it does the same
  as before. While updating it shows a spinner, “Restart required” shows a restart symbol. Desktop and
  tablet keep the text.
- Phone: the “Scenes” button in the bottom bar now shows the same scenes, in the same order, as the scene
  badge on desktop and tablet. With no selection at the badge it still shows all scenes. Existing phone
  dashboards follow the badge right away; opening the Studio once writes the selection into the phone layout.

## 1.0.4 – 04.10.2026

### Improved
- Soft look: the aquarium temperature chart uses a calm teal instead of bright cyan.
- Media popup: the apps (sources) no longer sit in a single row that is cut off on the right. They wrap
  and use the full width, sorted so every row is as full as possible, with the running app first. On
  desktop and phone, rearranged when the size changes.
- Soft look: the volume slider in the media popup is now filled in the Casora tone like the progress bar
  instead of the media colour, in light and dark.
- Soft look: while the player is open, its waveform button turns white like the open bell.
- Soft look: the round media button next to the bell, messages and “…” (the minimised player's waveform)
  now has the same background and shadow as those three buttons instead of a beige one, in light and dark.
  While something plays, its waves are in the Casora tone like the play button and progress bar, otherwise
  dark like the other icons.
- Soft look: the progress bar of the media players (Now playing on desktop and phone, the mini player
  next to the bell, the media popup and the Studio preview) is now always filled in the Casora tone, like
  the play button, instead of the media colour. The light cover tint of the card stays.
- Waste popup with the calendar turned on: the day card (next pickup or the tapped day) now sits at the top
  right above Bins, like in the calendar popup. On the phone it comes right below the header, followed by
  the bins and the calendar, and tapping a day gently scrolls up to the day card when it is out of view.
- Waste: when the waste source cannot be reached (for example the collection service refuses the connection
  and the waste calendar and pickup sensors are unavailable) and no pickup dates are known, the popup shows a
  calm note “Waste calendar unreachable right now” naming the source instead of empty sections, the month
  calendar stays visible without an empty day card, and the tile reads “Unreachable”. If only single sensors
  are missing but dates are there, nothing changes.

### New
- Look & Controls · Phone: a new “Room photo on the phone” slider sets how soft the room photo behind an
  open room looks, from Sharp (0 px) to Very soft (40 px). The default stays 28 px, the veil while
  scrolling follows it, and the Studio preview shows the room photo with the chosen softness right away.

### Fixed
- Camera tiles that are offline no longer show “Live” for a few seconds after the dashboard loads.
- Vacuum popup: while cleaning or returning, the large circle at the top showed only a small white
  triangle instead of the vacuum symbol. The whole robot with its direction arrow now sits centred in the
  circle, like the other popup headers.
- Bell after a Home Assistant restart: open windows and doors showed “Open for 10 min” and appeared again
  under New although they had been open for hours and were already read. Casora now remembers when each
  door or window contact was opened and keeps that across restarts, so the duration stays right and a read
  entry stays read.
- Bell: two contacts with the same name (for example “Window” in the bedroom and in the utility room) both
  read “Window is open” under New. The room now comes first in every section, like “Bedroom Window is open”,
  also right after loading the page.
- Desktop: a swipe stack in the tile row (for example plants/aquariums) no longer slides down by its own
  height below the other tiles. The stack had collapsed to zero height since the 1.0.4 swipe fix and now
  sits flush with the row again.
- Bell: after a Home Assistant restart, locks, doors and people no longer show up as new entries ("Front door locked") just because they came back online.
- Desktop and tablet: the tile row stays in one row again. Since the phone tile sizes were carried over from
  Hemma, the room tiles on the desktop also carried “Size on phone: large”, and desktop and tablet read it
  as well (large tile layout, row split into two rows with gaps, tiles slipping out of view). The size now
  only counts on the phone dashboard; on the phone large tiles stay large.
- Swipe tile: at the end of the stack the tile row scrolls on again, and while paging through the stack
  the row stays put (tablet and desktop).
- Media: a player that was already paused no longer shows up again for 10 minutes after every Home Assistant
  restart or short dropout. Casora remembers when it was really paused (same title), so the hide timer counts
  from there.
- The overview's name now looks the same everywhere: a name you gave it (also “Home” in German) stays
  exactly as you typed it in the navigation, room title, phone bar, phone header and Studio. Only the
  name Casora set up itself follows the interface language.
- Updates popup: the gap below Available updates no longer disappears after opening.
- Doors & windows (Soft): a room with just one contact now also shows the device name with the room below
  it, like rooms with several contacts (“Front door” / “Hallway” instead of only “Hallway”).
- Climate popup: air quality readings get short names like temperature and humidity (“PM2.5”, “CO₂”)
  instead of the device name, and names with umlauts are no longer capitalized wrongly (“LuftqualitäTsmonitor”).
- Kitchen · Recipes: long recipe names in the meal plan week strip wrap onto two lines and end with “…”
  instead of being cut off mid-word.
- Phone: in a room, tiles that are on (a light, a running washer) move to the front again, as on the
  desktop. The rest keeps the order from the Studio.
- Phone: a room shows its windows, doors and locks as badges, as in the room header on the desktop.
  Existing phone layouts pick them up when the dashboard is next opened in the Studio.
- Renaming a room in the Studio now also renames it on the phone: header, room page, bottom bar, room
  badges and the air quality title. Phone layouts brought over from Hemma are no longer left out, and a
  room renamed earlier is brought up to date when the dashboard is next opened in the Studio.
- Phone: every badge now gives the same light tap feedback as the tiles (before, Security, Climate,
  People and Media did not). In Weich, the air quality symbol in the badge circle is as large as the others.
- Phone: a room renamed in the Studio (for example “Utility room” for the Home Assistant area “Laundry
  room”) no longer shows every scene on its room page, only the scenes of its area. The area now comes
  from the room's tiles instead of its name, a room renamed in the Studio remembers it, and a room whose
  area cannot be found shows no scenes rather than all of them. Works without saving the dashboard again.
- Phone: opening a room from the bottom bar sometimes showed the blurred Home photo instead of the room
  photo, with Home headings like “Favorites” showing through the tiles. The room background now always
  appears, also when the page rebuilds the room while switching.
- Phone after moving from Hemma: tiles that were large on the phone in Hemma (cameras, robot vacuum,
  appliances, car, eBike, plants, media, recipe, lock …) are large again. Dashboards moved with an earlier
  version get their sizes back once from the move backup when they are next opened in the Studio, with a
  short note; sizes you change yourself afterwards stay.
- Phone: when a room has the same tile twice, each one keeps its own settings (such as Size on phone) on
  saving, and tiles that only show under a condition stay in their place instead of moving to the front.

## 1.0.3 – 04.10.2026

### New
- **Plants say what they need:** one plain wording for tile, popup and notifications: “Doing well”,
  “Needs water”, “Too wet”, “Needs fertilizer”, “Over-fertilized”, “Needs more light”, “Too much sun”,
  “Too cold”, “Air too dry”, “Take a look”. If several readings are off, water comes first.
- **A new mark:** roof and rooms in Casora's warm tone with one window lit in honey, with a lighter
  version for Home Assistant in dark mode.
- If Casora was installed through HACS, updates appear only in HACS, so Casora is no longer listed twice
  under Settings → Updates.
- **Rename Favorites on the phone:** Studio → Home → Appearance → “Name on phone”. The section stays the
  favorites section under any name, it never turns into a room.
- **Washer and dryer:** the popup shows progress, finish time, program and phase, “Done, laundry inside”
  with an “Unloaded” button, recent runs and stats per program. Casora prefers the maker's integration
  (Home Connect, Miele, SmartThings, LG ThinQ and others), then WashData, then a smart plug.
- **Security in the room:** locks, alarm, contacts and cameras can show as their own badges
  (Studio → room → Badges → “Show individually”), colored green, orange or red by state.
- **Name your own cards** in the Studio tile list.
- **AI schedules per feature** under Settings → AI: Off, Automatic (previous time) or a custom weekday and
  time. New installations start with everything off; existing installations keep their previous behaviour.
  The AI update check runs once a day instead of every hour, or only when you tap the button.
- **Beta versions:** a new switch under Updates gets pre-releases early (off by default; with HACS, turn on
  betas in HACS).
- **Electricity price from the Energy dashboard:** device costs use the grid price from Home Assistant's
  Energy settings when no price is set in Casora, including a live price entity.
- **Active rows:** popups for lights, heating, ventilation, network, aquarium, windows and doors, locks,
  covers and room climate highlight what is on or needs attention.
- The recipe of the week can put its ingredients on a shopping list of your choice.
- **Moving from Hemma keeps your own work:** your own JS modules stay loaded, customized popups are
  recognized, “Mine” becomes its own tile type while the Casora tile keeps getting updates, and folders
  your automations write to stay in place.

### Improved
- The plant tile reads the cause straight from the plant, even without sensors set up in the tile.
- Casora checks for updates directly on GitHub. The update server, the Casora key and the
  “Update access” page are gone.
- New README, guide and website, and all screenshots in the Casora look.
- Setup assistant: “Set up automatically” uses Casora's warm tone instead of a bright blue.
- The Updates tile follows the Studio again: by default it only shows when there is something to update.
  On the phone it no longer appears at full height first and then collapses.

### Fixed
- Swipe tiles (e.g. plants) no longer cast a square shadow: the stack no longer clips the card shadow at a rectangular edge.
- Phone: tapping the security badge shows its sub badges again (locks, cameras, contacts), like climate and lights.
- Updates popup: brand logos in the rows get rounded corners like an app icon, so square logos look calm inside the circle.
- The top navigation shows the overview under the name you typed (e.g. Home), like the room title,
  instead of translating it.
- Room energy badge: rooms that earlier got just one device power sensor automatically now show the sum of all devices in the room once; a device total sensor counts alone, otherwise every channel counts (no double counting).
- Plant popup: the light row was marked orange although the plant integration doesn't rate light.
- No error message when Home Assistant restarts while the dashboard is open.
- A door with a lock sensor and a contact sensor is reported open only once.
- The air quality badge shows the same rating as its popup (CO₂ and particle sensors count), in
  matching color and symbol.
- The battery popup is only wide when it shows two columns.
- Changing the Home Assistant language no longer breaks tiles with a template error.
- Phone: no extra gap above the next section when nothing is playing, and hidden tiles no longer
  flash back after closing a filter.
- Weather popup: rain, wind and visibility use the decimal separator of your language.
- Rooms with only a window or door contact show the security badge again.
- Badge order matches Hemma: security, climate, lights, people, energy, scenes, media.
- The energy badge shows in every room that measures power, also at 0 W; switching it off stays off.
- The bell shows one dot, also with several notifications, and no longer reports fuel station sensors
  as open doors. Windows with the same name in different rooms are all reported.
- Phone: the room badge row appears on first open, badge circles sit evenly, the Studio works in
  landscape, “Update all” lines up with its heading.
- Swipe tile: at the end of the stack the row scrolls on, the dots can be tapped, vertical swipes scroll
  the page.
- Air purifier and fan show mode and speed as Home Assistant names them.
- Waste tile shows the next pickup when no duty is planned; aquarium devices count as running from 2 W.
- iPads no longer switch to the reduced effects mode.
- AI answers (coaches, camera, plants, aquarium, e-bike, update check, recipe) use the language of Home
  Assistant.
- Room energy badge: without a sensor for the whole room it shows the sum of all plugs and devices, and its
  popup lists each one.
- Phone: the light chip is back after temperature and humidity, chips have an even gap, the Media badge only
  appears while something is playing, and the home screen photo follows the one chosen in the Studio.
- Weich: scene buttons match the other tiles.
- Vacuum, 3D printer and underfloor heating find their entities through the official integrations, in every
  Home Assistant language. Without a printer name the popup shows the device name.
- Car doors, windows and locks no longer count as openings of the home.
- Windows and doors popup and plant popup are fully translated to English.
- The camera badge says Camera for one camera and Cameras for several.
- Tapping an "is open" notification for a window or door opens the Doors & windows popup instead of the locks popup.
- Updates popup: the two columns under More line up, also in Safari, and the AI check rows match the other rows.
- A running update shows "Updating" with a small spinner instead of almost invisible text.
- Integrations without a brand image show a neutral puzzle icon instead of "icon not available".
- The Updates tile shows a download arrow when updates are available and a restart arrow when a restart is pending.
- Climate popup: More sits below the readings.
- Player: the tip of the skip forward button is no longer cut off.

### Changed
- The e-bike tile works with the Bosch eBike integration (Bosch Smart System). The fields for a custom charger
  and live battery sensor are gone.
- Aquarium tile: pick the light profile, the schedule switch and the dosing pump buttons in the advanced
  fields. Older tiles with an entity prefix keep working.
- Waste settings: the "your turn" months, sensor and reminder sit under a collapsed "Advanced" section.

Several of these fixes and the phone favorites name were taken over from Hemma 2.2.0 (MIT).

## 1.0.1 – 02.10.2026

### Improved
- **Setup:** The preview images for look and effects now show the current Casora design.
- **Choosing a font:** Every font shows a large specimen with sample lines, so the difference
  is clear at a glance.
- **Inter is Casora's font,** also in the Casora look. Plus Jakarta Sans is removed; if you had
  picked it, you get Inter.
- Notifications: The first entry no longer sticks to the top edge when everything is read.
- Checkmarks and success messages in the assistant use Casora green instead of a harsh green.
- Vehicle: Derived helpers (for example a monthly counter) are no longer mistaken for the real
  odometer.
- Status lines never break right before a “·” anymore, and the space before the “·” in sublines is back.
- **Polish after a complete review** of Studio and dashboard in light and dark, on desktop, tablet and phone:
  consistent column spacing in popups, “More” in two columns for network, energy, updates, washer, dryer
  and robot vacuum too, full size climate icons, clearly visible Assist suggestions, camera buttons with
  room to breathe, Studio colors matching the Casora look, cut off selection fields end with “…”, and the
  room menu in the sidebar has icons.
- Energy without a power sensor shows today's value as the main line.
- **Moving from Hemma feels like an update:** Rooms, tiles and badges come along one to one. The new dashboard
  is called “My Home”. Switches, aquariums and doorbells become Studio tiles, the overview's weather is added
  to rooms without their own weather, and the lighting badge appears even with a single light group. A YAML
  dashboard that can't be read is shown with a note instead of being skipped silently.
- **Removing Hemma:** After the restart, Casora checks that everything is gone and confirms it in the Studio.
- **Batteries:** Charging devices are highlighted like active tiles, with the room as a subline. Low batteries
  show an orange or red icon, and the section is called “Low battery” (which also fits built in batteries).
- **Camera:** No separate privacy logic anymore. A camera that is switched off is simply off, the same for
  every integration. The name on the still image is readable in light looks too.
- **Device missing:** If a tile's device no longer exists, the tile shows “Device missing” instead of “Off”,
  and the popup points to the Studio. The tile list in the Studio marks these tiles as well.
- **Time travel:** Restore and “Back to now” stay pinned to the bottom, and the summary only lists real changes.
- **Calendar:** The ring shows today's date, calendar colors match the look, and tapping the icon opens the
  calendar.
- **Studio:** Tile list and room view use sublines instead of a crowded right column, the device assistant's
  selection fields match the Studio style, the first field in the tile editor can be removed too, and every
  dashboard can be saved.
- Climate sub badges with full size icons, room chips in the lighting popup fade out softly, and the setup
  shows preview images in your language.
- Aquarium doctor and bike check run through Casora itself and no longer need scripts of their own.


## 1.0.0 – 02.10.2026

### New
- **New Casora look:** warm linen and sand, large corners, soft shadows, in light and dark.
  It is the new default. The previous looks stay available as “Hemma (Legacy)” and
  “Hemma Glass (Legacy)” and look exactly as before.
- **Popups rebuilt:** ring, title and a status line at the top, controls on the left, devices
  on the right. Things you rarely need sit in the collapsed “More” area. It spans both columns
  and spreads evenly over two columns when opened.
- **Vehicle for any integration:** The car tile now recognizes cars by their values instead of
  a specific integration, for example VW, Škoda, Tesla or BMW, including EVs with battery level.
  Several cars are possible.
- **Recipe popup:** meal plan as a week strip, idea of the week as a banner, shopping list in
  two columns.
- **Scenes popup** with scene chips like the lighting popup.
- **Custom font:** Plus Jakarta Sans is included. Your own fonts (for example Gilroy) can be
  uploaded in the Studio under “Look & Controls → Text”.
- **Studio in light and dark,** matching Home Assistant, with consistent icon colors and action
  buttons in the accent tone like the dashboard.

### Improved
- One color system for icons in badges, menus and the Studio.
- Media: volume, progress and ring in pink red, Apple Music in its own red. The ring is gray
  while nothing is playing.
- Cameras: technical duplicate streams hidden, an “All cameras” arrow, age shown as “… min ago”.
- Badges with a colored icon circle, tile switches and type tuned to match. A badge row that is
  too long fades out softly on tablet and desktop.
- Waste and heating: the headings of both columns line up.
- The overview's name stays exactly as you type it, including “Home” in German, on desktop and
  phone.
- A fresh Casora always greets you with “Welcome to Casora”.
- Moving from Hemma: Hemma's helper values are carried over, and “Remove Hemma” cleans up thoroughly.

### Fixed
- 3D printer: The tile turns red on “Failed”, like the popup.
- Media popup: The room line under the title was cut off at the top (umlauts).
- Studio: Clicking a room from Settings, Updates or Time travel didn't take you back to the room.
- Heating coach: “Evaluate again” depended on a wrong condition.
- Aquarium light opened an empty popup.
- Alarm: After disarming, it couldn't be armed again without reopening.
- Descenders in the tile status were cut off.

### Removed
- Old, unused popups (old contact, aquarium overview, aquarium light, old robot vacuum, old
  dishwasher). Existing tiles redirect to their successors.


## 0.5.1 – 30.09.2026

### New
- **Welcome and start page:** New users first see what Casora is, then
  “How do you want to start?” with Set up, New dashboard, From Hemma or YAML import.
  The assistant no longer starts on its own. The start page is always reachable through
  “Start page …”.
- **Settings in the Studio:** a “Casora, for all dashboards” area in the sidebar with
  Home & devices, Bell & notices, New dashboards, AI, Outdoor values & electricity price,
  Ventilation and Update access. These are the same options as under Integrations, plus the
  previous home settings.
- **Updates with a Casora key:** Casora can get updates from its own update server;
  instead of a GitHub token, a personal key that can be revoked is enough.
  An existing token keeps working for now.

### Improved
- **“Rewind”** (German “Zeitreise”) instead of “Versions”, so it isn't confused with
  updates.
- **Badge rows scroll sideways** when they are too wide: on desktop with the mouse wheel
  and by dragging, on the phone by swiping. The scenes badge also expands in the preview.
- Long room names in the sidebar end with “…”; states like “Jammed” or
  “Unavailable” appear in German; numbers use a decimal comma everywhere.
- Room climate and solar tip no longer land on “Home” on their own, only through
  “Add tile”.
- **All scenes** in the scenes badge instead of at most ten; the row scrolls.
- **English interface** reworked (consistent terms, missing translations added).
- Release notes in Home Assistant's update dialog are readable; the note about missing
  update access appears only once.

### Fixed
- Studio preview: the navigation bar stuck out over the edge.
- Start page: “Cancel” in the settings didn't lead back.
- Phone: sub badges (lighting, energy, media) were partly out of reach.
- Phone: with many rooms, rooms in the “Rooms” menu seemed to be missing. The list
  now shows that it scrolls and jumps to the open room.
- After an update without a restart, the Studio stayed empty (takes effect from the next update).

### Quality
- A fixed check now runs before every release: syntax, unit tests, end-to-end tests,
  regression tests for every reported bug and an automatic walk through Studio and
  dashboards on desktop, tablet and phone, also with a stress house
  (many rooms, scenes, long names).

## 0.5.0 – 30.09.2026

### New
- **Updates in the Studio:** its own area “Casora → Updates” in the sidebar. All
  versions with their changes to expand, “Install” with progress and a
  restart notice, “Check for updates”. With update access from GitHub, otherwise from the
  bundled CHANGELOG.
- **Card updates:** fixes for single cards and popups come as small packages of their own
  (`karten-…`), without a restart, checked by checksum and minimum version, and
  automatic if you like. Cards you customized yourself stay untouched.
- **Templates stay current:** after an update, Casora brings all dashboards to the new
  templates at startup. Only unchanged ones, and a version is saved first.
- **Draft:** unsaved changes survive a reload; “Done” asks first.
- **Popup settings in every tile** with a popup: title and fields right in the
  tile editor, with a live preview.
- **“Add tile” with search** and “Fits <room>”; when the match is unclear, Casora
  asks.
- **Moving recognizes renamed Hemma dashboards** (different template prefix).

### Improved
- **Moving:** AI no longer preselected, price on the button, name field, hide the old
  dashboard (YAML: a note), comparison with an AI column, first version right after the move.
- **Phone:** takes over renaming, moving and deleting rooms, the same
  home badges as on desktop and the tile order from the Studio. Faster first
  load (bundled scripts, cache), no unfiltered intermediate state anymore.
- **“Zuhause”** is the name of the overview room in German, “Home” in English.
- Selection fields with names, search and matching devices first; glass design in the preview
  and undoable; tile row on desktop with mouse wheel and dragging.
- Sensors are checked for plausibility (weather, updates, thermostat, energy,
  batteries); German numbers and dates in popups and charts.

### Fixed
- Security showed “Secured” although a door was unlocked; climate, car, e-bike,
  room climate, recipe and light popups were partly empty; network “Offline” despite a connection.
- Popups on iPhone were see-through; the scenes menu on the phone showed all scenes of the house.
- The room template was never updated on newly created dashboards.
- First letter swallowed when renaming; room icon changed when renaming.

## 0.4.0 – 29.09.2026

### New
- **Updates without HACS:** with a read-only GitHub token in the Casora options
  (“Update access”), new versions appear under Settings → Updates. “Install”
  backs up the running version to `casora_sicherungen/` and tells you when a restart
  is needed.
- **New setup assistant:** pick a look (Casora Standard or Casora Glass),
  effects for weaker devices, rooms as photos, “How do you want to start?” with a live preview
  of the Hemma dashboard, a finish page with desktop and phone preview and “Use as
  default dashboard”. Pages glide into each other.
- **Rooms fill themselves (standard room):** “Start fresh” puts devices straight into
  their rooms, sorted (lights → heating → air → covers → media → devices). From two
  lights, covers or locks they are combined into one tile, status LEDs are left out,
  favorites go to Home. Preview with deselect; the rules are under “Personal → Standard room”.
- **AI (optional, your own API key):** when moving, carry your own tile customizations over
  to Casora's version (per tile type “Mine | Casora | ✦ AI”, “All with AI”, preview through
  “View”), and during setup assign devices without a room and name tiles. Casora picks
  the right AI itself (Sonnet before Opus), estimates the cost first and can create its own
  “Casora AI” with a strong model if the existing one is too weak.
- **Room photos for 31 room types**, picked by room name when there are no photos of your own.
- **Moving assistant Hemma → Casora:** the Studio finds Hemma 1 and Hemma 2 dashboards
  itself (at first start and in the menu “Move from Hemma …”), shows rooms, tiles and
  custom cards, backs up the original (`casora_sicherungen/`) and creates a new
  Casora dashboard with a phone layout next to it. Tiles you customized are recognized by
  the fingerprints of all Hemma original templates; for each tile type you choose “Keep
  mine” or “Take Casora's” instead of losing them silently.
- **Studio → “Personal …”:** waste (bins, duty months, calendar, reminder),
  calendars with colors, bell (zone wording, mailbox, battery exceptions,
  combined contacts, device care), hidden scenes, door and window groups,
  Now Playing icons and volume, night mode switch and e-bike, stored in
  the integration instead of a file. An existing `einstellungen.js` is taken over the
  first time you open it.
- **Ventilation by push:** pick recipients (notify services) and optionally people in the
  Casora options. “Ventilate now” from 7 to 22 only when someone is home, “Close
  windows” from 7 to 23, both only after 10 min; CO₂ from 2500 ppm right away as a critical
  notice. Without recipients there are no push notices.
- **Network popup finds devices itself:** routers, access points, switches, Wi‑Fi networks and
  latency, independent of the maker (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik, OpenWrt …).
  Your own lists in the dashboard still take precedence.

### Improved
- Conditional tiles show the name, icon and fields of the tile inside them in the Studio, and their
  condition in words; conditional collection cards (automatic, carousel) are named.
- Old Hemma dashboards also look right under the Casora theme (theme bridge
  `--hemma-*` → `--casora-*`).
- Inter font as in the Hemma original; header at the same height as in Hemma.
- Phone preview with a real notch: wallpaper up to the top, navbar in its place.
- Studio: selection texts and placeholders fully in German.
- No fixed entities in the code anymore: doors and windows, outdoor sensors, backup, Cookidoo,
  e-bike and scenes are detected or set in “Personal”.
- English complete: popup titles, live updated values and texts inserted later
  are translated too; about 560 more texts and patterns.
- Casora's own sensors (ventilation, solar tip, AI) are named in Home Assistant's language.
- Scene chips: “last activated” and more room for chips sized to their content.
- Screenshots for README and website from a neutral, English demo house.

### Fixed
- New empty dashboards got no navbar on the phone.
- The light tile didn't count a list of lights without an HA group (“2 On”).
- The sidebar stayed hidden after the dashboard preview.
- “Move to Casora” clicked twice created two dashboards.
- The template package contained fixed network entities of a sample house; the
  build now checks nested lists too.

## 0.3.0 – 27.09.2026

### New
- **Sets itself up:** the integration creates helpers, scripts and the Casora theme
  at startup (the service `casora.einrichten` repeats it). `packages/casora_helpers.yaml`
  and `themes/casora/` are gone; the theme is switched on with the first dashboard.
- **Room climate and solar tip** without fixed entities: `sensor.casora_lueften`,
  `binary_sensor.casora_lueften_hinweis`, `binary_sensor.casora_solar_tipp`.
- **Multilingual tiles and popups:** texts follow Home Assistant's language
  (German, English).
- **“Welcome” / “New in Casora”** in the Studio, once per version.
- Now Playing: Netflix and DAZN logo when the player provides no image.

### Improved
- The Studio greets new users even when HA's own “Map” dashboard exists.
- New dashboards: HA header off (also without kiosk-mode), room addresses with
  umlauts, sensible room preselection, clock in HA's time format, “Add devices” as the
  next step; the device assistant saves by itself.
- Import: the phone layout gets the tiles right away.
- Desktop: glass pill centered next to the sidebar, the clock never below it.
- Cameras tile without a selection shows all cameras; camera popup with a still image for
  cameras without a stream; camera tile on the phone in the normal tile grid.

### Fixed
- Phone/desktop redirect caused many console errors (“reading 'config'”).
- Tapping a room on the phone: error message because of a missing filter option.
- The vacuum icon called the service `vacuum.turn_off`, which no longer exists.
- Aquarium tile without a state; 3D printer icon dark while printing.
- Default background image and room images on new installations (404).

### Removed
- Plex (tile, popups, badge, Now Playing sources, sensor, `swipe-card-patch.js`).

## 0.2.0 – 26.09.2026

### New
- Its own name throughout: templates, cards, CSS variables, scripts, theme and
  helpers are called “casora…”. The service `casora.umstellen` converts existing dashboards
  (with a backup); Hemma dashboards are translated on import.
- AI in the integration: energy, heating and ventilation coach, camera and
  plant AI, update check, recipe of the week, with options (AI, web AI,
  outdoor sensors, electricity price, notices).
- Devices are found automatically: 3D printer, washer/dryer, dishwasher,
  robot vacuum, underfloor heating, solar storage, car, waste, calendar.
- Casora Studio: Casora tiles with icon and fields, “Automatic: …” placeholders,
  “Complete with AI”, device assistant, import assistant for Hemma 1.
- Your own settings in `/config/www/casora/einstellungen.js`.
- Icons, weather and room images come from the integration (`/casora_assets`).

### Transition
- `casora-kompat.js` keeps old element and window names available for dashboards that
  haven't been converted; the theme “Hemma” is an alias of “Casora”.
