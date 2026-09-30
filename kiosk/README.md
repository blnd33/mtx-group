# Silent receipt printing (Chrome / Edge)

The online POS runs in a browser, and a browser normally opens the OS print
dialog on every receipt. These launchers start Chrome or Edge with
`--kiosk-printing`, so `window.print()` goes straight to the printer with no
dialog and no extra click.

Nothing in the app changes — it already calls `window.print()`. This is purely
how the browser is started.

## Easiest: from inside the app

**Settings → Receipt & Invoice → Silent receipt printing** downloads
`MTX-POS-Setup.bat`, saved as `MTX-POS-Setup-Edge.bat` or `-Chrome.bat` to match
the browser it came from. Running it once:

- creates an **MTX POS** shortcut on the Desktop and in the Start menu, with
  the MTX icon, that opens the till with `--kiosk-printing` on its own profile
- shows which printer is the Windows default, i.e. where receipts will go

Nobody needs the repo for this, which is the point: a shop that installed the
suite from the browser gets silent printing from the same place. The browser and
Windows SmartScreen will warn about a downloaded `.bat`; that is expected for
any unsigned script (Keep → More info → Run anyway).

The browser's own **Install app** window cannot print silently — it shares the
normal browser process, where the flag never applies (see below). Use the MTX
POS shortcut for the till.

```bat
MTX-POS-Setup.bat                      REM browser from the file name, else Edge
MTX-POS-Setup.bat chrome https://...   REM explicit browser and address
MTX-POS-Setup.bat remove               REM delete the shortcuts
```

## Launchers

Double-click one of:

| | |
|---|---|
| `MTX POS (Edge).bat` | opens the POS in Microsoft Edge |
| `MTX POS (Chrome).bat` | opens the POS in Google Chrome |

Or from a command prompt:

```bat
run-kiosk.bat edge
run-kiosk.bat chrome
run-kiosk.bat edge https://mtx-group.net/        REM a different address
run-kiosk.bat edge https://mtx-group.net/ --check  REM show what it found, launch nothing
```

Put a shortcut to the one you use on the till's desktop, or in
`shell:startup` so it opens on boot.

## Set up each till once

**1. Make the receipt printer the Windows default.**
`--kiosk-printing` prints to the default printer without asking, so whatever is
default is what receipts come out of. Settings → Bluetooth & devices →
Printers & scanners → pick the thermal printer → *Set as default*, and turn OFF
"Let Windows manage my default printer" (it will otherwise switch the default to
whatever was last used).

**2. Set the paper size on that printer** to the 80mm (or 58mm) roll in its
printing preferences, or receipts come out on A4.

**3. Sign in once** in the new window — see below.

## Things worth knowing

**It uses its own browser profile.**
`--user-data-dir` points at `%LOCALAPPDATA%\MTX-POS-Kiosk\...`. That is
deliberate and it is the part people get wrong: Chromium only applies
command-line flags when it starts a **new** process. If Edge or Chrome is
already open, launching it again just adds a tab to the process already
running and `--kiosk-printing` is **silently ignored** — the dialog keeps
appearing and it looks as though the flag does nothing. A separate profile
forces its own process, so the flag always applies. It also keeps the till
window away from staff browsing, history and logins.

Because it is a separate profile, the first launch is a fresh browser: sign in
to the POS once in that window. On the online build the data comes down from
the server, so nothing is lost.

**If the dialog still appears**, in order:

1. Close **every** Edge/Chrome window first, then launch again — a leftover
   background process from the same profile will swallow the flag.
2. Confirm it really is running with the flag: `run-kiosk.bat edge ... --check`
   shows the executable and profile it will use.
3. Some builds only honour `--kiosk-printing` alongside full kiosk mode. Add
   `--kiosk` to the `start` line in `run-kiosk.bat` — that also locks the
   window fullscreen, which suits a till.

**Printing is silent, so nothing tells the cashier it failed.** If the printer
is off or out of paper the receipt is simply lost. The app cannot detect this —
the browser reports success as soon as the job is handed to Windows.

## The desktop app already does this

The Electron build (`npm start`, or the installer) prints silently on its own
through `electron/main.js` — no flags, no separate profile, and it falls back
to the print dialog with a message if the printer fails. These launchers exist
for the online version, which runs in a plain browser.
