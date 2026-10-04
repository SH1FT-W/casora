# Contributing to Casora

Bug reports and ideas are welcome in the [issue tracker](https://github.com/SH1FT-W/casora/issues). Please include your Home Assistant version, your Casora version and, if something looks wrong, a screenshot.

## Pull requests

- Keep changes focused and describe how you tested them.
- **Keep personal data out of the repo:** no real names, home paths or entity IDs from your own home. `dev/install-hooks.sh` installs a pre-commit check (`tools/privacy-check.py`) that catches this.
- The Studio's texts are translated with `tools/build-panel-i18n.py`, and dashboard texts with `tools/build-i18n.py`.

## Screenshots

Every image in the README shows the neutral English demo home, never a real one.

1. Switch the test Home Assistant to the demo state (`dev/haus.sh demo`). The demo fixture comes from `dev/demo/demo_fixture.py`; on start the mock integration writes day curves for the climate sensors into the recorder, so popup charts aren't flat.
2. Take the raw shots: `dev/e2e/screenshots.mjs` (desktop in Chromium, tablet as an iPad Pro 11″ and phone as an iPhone 15 Pro in WebKit, each light and dark).
3. Build the framed README images offline: `dev/e2e/readme-compose.mjs`.
