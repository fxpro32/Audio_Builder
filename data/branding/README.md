# Branding (logo)

Put the logo here as one of these file names (the first one found is used):

- `logo.svg` (best: sharp at any size)
- `logo.png`
- `logo.webp`
- `logo.jpg`

The app server serves it at `/api/branding/<file name>` and the welcome page shows it for 3 seconds at every app load, then the start menu. Until a logo file is here the welcome page shows the text "Audio Builder" instead.

A server started before B1_SHELL (2026-11-23) does not know this folder: run `scripts/restart_app.sh` on the Fedora host once. After that, dropping or replacing the logo needs only a page reload.
