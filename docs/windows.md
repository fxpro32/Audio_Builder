# Audio Builder on Windows (W1_WINDOWS, R45, 2026-11-23)

Requirement R45 (2026-11-23): "also, please update it so that it can work on a windows machine too". Someone who clones the project on Windows 10 or 11 with Node.js installed can install, build, start, restart, stop and use the app at http://localhost:8420.

## What you need

- Node.js 22.12 or newer with npm: the LTS installer from https://nodejs.org/ (it puts `node` and `npm` on the PATH).
- Git for Windows to clone, or a ZIP of the project.
- Nothing else: no WSL, no bash, no admin rights.

## The scripts

| File | What it does |
|---|---|
| `scripts\start_app.cmd` | Checks `node` and `npm` are on the PATH (if not: a message with the nodejs.org link), then runs `node scripts\start_app.mjs --open`. |
| `scripts\start_app.mjs` | The start itself, on any system: Node.js version check (22.12 or newer); `npm ci` if `app\node_modules` is missing (npm cache in `.npm-cache\cache`); `npm run build` if `app\dist\index.html` is missing (same rule as `start_app.sh`); if `http://127.0.0.1:8420/api/health` answers it says "Already running"; otherwise starts `node server/server.mjs` in `app\` as a detached background process with no window, output appended to `data\private\server.log`, then waits up to 10 s for `/api/health`. With `--open` it opens http://localhost:8420 in the default browser. `PORT` and `AB_DATA_DIR` are honoured (the log then goes to `<AB_DATA_DIR>\private\server.log`). |
| `scripts\restart_app.cmd` | Checks `node`, then runs `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\restart_app.ps1` (Bypass applies to that one call only; no system setting is changed). |
| `scripts\restart_app.ps1` | Finds the process listening on port 8420 with `Get-NetTCPConnection` (or `netstat -ano` if that cmdlet is missing), reads its command line with `Get-CimInstance Win32_Process`, and stops it only if the command line contains `server\server.mjs` or `server/server.mjs`; anything else on 8420 is left alone and the script stops with "not touching it". Then it starts the app again with `start_app.mjs`. `-StopOnly` stops without starting. |
| `scripts\stop_app.cmd` | `restart_app.ps1 -StopOnly`. |

When a `.cmd` file was started by a double-click, its window waits for a key at the end (so the messages can be read). It detects this from `%cmdcmdline%`; run from PowerShell (`& ...\start_app.cmd`) it also waits, run from an open Command Prompt it does not.

Cross-platform alternative on any system: `node scripts/start_app.mjs [--open]`, or `npm run app` inside `app\`.

## Changes made to the app for Windows

| Issue | Fix |
|---|---|
| The server listened on `0.0.0.0`: on Windows that brings up a Windows Defender Firewall prompt and opens the app to the local network. | On Windows the default address is `127.0.0.1` (localhost still works). Linux and macOS keep `0.0.0.0` (the container setup needs it). `AB_HOST` overrides both. |
| `fs.renameSync` over a file (every save is write `.tmp` then rename) fails now and then on Windows with EPERM / EACCES / EBUSY while antivirus or the search indexer holds the file. The same for "delete" (move to `data\private\deleted`). | `renameRetry` in `app/server/fsx.mjs` retries for up to about 2 s on Windows only; elsewhere it is the plain rename. A move across drives (EXDEV) copies then removes, on any system (it can only happen if `data\private` is put on another drive). |
| Ids such as `con`, `nul`, `aux`, `prn`, `com1`, `lpt1` (with or without an extension) are device names on Windows: a project or item with that name cannot be saved there. | The server's id rule (`safeId`) refuses those names on Windows. On Linux the rule is unchanged. |
| The static-file check used `p.startsWith(DIST)`, which also lets through a sibling folder whose name starts with `dist` (for example `app\dist-tsc`), on any system. | `insideDir` (path.relative based, case-insensitive on Windows, refuses another drive). |
| The "App not built" message named `/workspace/app`. | It names the real `app` folder. |
| `app/tests/engine.test.ts` read `/workspace/app/tests/fixtures/openisd_sample_ACI_SV10.wdr` (an absolute path that exists only in the container; failed on Windows and on any other Linux folder). | Read relative to the test file (`new URL(..., import.meta.url)`). |
| No Windows launchers. | The `.cmd` / `.ps1` files above; `.gitattributes` keeps them CRLF (and `.sh` LF) whatever `core.autocrlf` is set to. |

Checked and fine as they were: `app/package.json` scripts (only `&&`, which cmd.exe understands), `vite.config.ts`, `tsconfig.json`; `app/package-lock.json` lists the Windows x64 and arm64 binaries of rolldown, TypeScript 7 and lightningcss, so `npm ci` installs them on Windows; the tracked file names contain no Windows device names, no `: * ? " < > |`, no trailing dots or spaces, no names that differ only in case, no symlinks, longest path 74 characters; the text importers (REW, WinISD, CSV, meshes) split lines on `\r?\n`, so files saved on Windows read correctly; the importer scripts find their folder with `fileURLToPath`; the server builds every path with `node:path`.

Helpers and tests: `app/server/fsx.mjs` (+ `fsx.d.mts`), `app/tests/fsx.test.ts` (POSIX and Windows paths through `path.win32`, device names, rename retry and EXDEV with a fake fs, a real rename over an existing file). Patch scripts: `scripts/w1_patch_server.py`, `scripts/w1_patch_readme.py`.

## What was tested (on Linux, 2026-11-23)

- `npx tsc --noEmit -p .`: no errors. `npx vitest run`: 23 files, 397 tests passed (389 before plus 8 new in fsx.test.ts).
- `scripts/start_app.mjs` on a scratch copy of the project (no `node_modules`, no `dist`) with a fresh data copy, `PORT=8421`: first run did `npm ci`, the build and the start ("Running"); second run said "Already running"; `/api/health` answered with the copy's data folder; `/` and `/api/projects` returned 200; the server's command line was `node server/server.mjs` (what `restart_app.sh` and `restart_app.ps1` look for). The test server was then stopped by its PID.
- The `.cmd` and `.ps1` files were reviewed line by line; two faults were found and fixed in review (an `echo` with brackets inside a `( )` block would have ended the block early; the `netstat` fallback relied on the English word LISTENING and on a leading space that PowerShell's `-split` turns into an empty first field).

## What was NOT tested

There was no Windows machine and no PowerShell (`pwsh`) in the container, so nothing has been run on Windows:

- the `.cmd` files (double-click detection, `where node`, error codes, the pause), and `restart_app.ps1` (not even a syntax check);
- `npm ci` and `npm run build` on Windows (the Windows binaries are in the lock file but were not installed);
- the detached server surviving when the window that started it is closed, and the hidden window (`windowsHide`);
- the rename retry against a real antivirus lock; the `127.0.0.1` bind with a browser that tries `::1` first for `localhost` (browsers are expected to fall back to 127.0.0.1; not checked);
- the browser opening (`cmd /c start`).

The first person to run it on Windows should run `scripts\start_app.cmd`, open a project, save it, then `scripts\restart_app.cmd` and `scripts\stop_app.cmd`, and report what each printed.

## Limits

- Like `start_app.sh`, the start scripts build only when `app\dist\index.html` is missing and run `npm ci` only when `app\node_modules` is missing: after a `git pull` that changes the app or its packages, run `npm ci` and `npm run build` in `app\`, then restart.
- If a group policy on the computer forbids PowerShell scripts outright (`-ExecutionPolicy Bypass` cannot override a policy set by the administrator), restart and stop will not run; start does not use PowerShell. To stop the server then, end the `node.exe` process running `server\server.mjs` in Task Manager (Details tab, Command line column).
- A ZIP downloaded from the web may be blocked by SmartScreen on the first double-click ("More info", "Run anyway"), or unblock the ZIP in its Properties before extracting.
- The research and data-building scripts (`scripts/*.py`, `*.sh`, headless dry runs) are for maintaining the data and were not made Windows-ready; the app does not need them to run.
- The SessionStart hook in `.claude/settings.json` is for the owner's Claude Code set-up on Linux and is not part of the app.
