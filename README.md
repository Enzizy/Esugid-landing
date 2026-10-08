# E-sugid — interactive thesis defense

An immersive, scroll-driven presentation of **E-sugid: Design and Development of a Centralized Community Communication and Information Dissemination System**. It doubles as a public showcase and a 12–15 minute defense deck (14 chapters, planned at 13:40).

The 3D scene is Barili itself. All 42 barangays are extruded from the PSA 2020 boundary file inside the app (`assets/data/barili_barangay_boundaries.geojson`). Each chapter turns that map into evidence of the system working:
- a concern travels from a Vito household to the office the resident picks
- an announcement reaches only Vito or all 42 barangays, exactly as in the captured *Recipients* column
- an alert pulses over its audience
- each staff role lights up its own scope

Real app and dashboard screenshots appear alongside the map in crisp HTML frames, never redrawn.

## Run it

| Situation | What to do |
| --- | --- |
| Defense laptop | Double-click **`START_DEFENSE.cmd`**. It serves the site locally and opens it in defense mode. |
| Browse / rehearse | Double-click **`START_PREVIEW.cmd`** (or run `START_PREVIEW.ps1`). |
| No server at all | Double-click `dist/index.html`. Everything works, including 3D, from disk. |

Nothing needs installing. The preview server uses Windows' built-in PowerShell `HttpListener`. Everything is local: fonts, Three.js r180, images and data. The site never contacts the live E-SUGID backend or any CDN, so it works with the network disconnected.

## Presenting

| Key | Action |
| --- | --- |
| `→` `PgDn` `Space`* | Next step (clickers work) |
| `←` `PgUp` | Previous step |
| `1`–`9`, `0` | Jump to chapter 1–10 · `Home`/`End` first/last |
| `G` | Chapter list with time budgets |
| `L` | Feature library: every screen, full size, with capture notes |
| `P` | Defense mode: HUD, progress, timer against the 13:40 plan |
| `N` | Presenter notes (hidden from the audience until pressed) |
| `W` | Presenter window for a second screen: notes, timer, next-up, controls |
| `B` | Black screen · `F` fullscreen · `T` reset timer |
| `M` | Motion: **Full** → **Calm** (3D holds still, no camera travel) → **Static** (no 3D, every step in reading order) |

\*Space advances in defense mode. Some beats have sub-steps that `→` walks through:
- recipient choice
- announcement audience
- alert wizard
- assistant replay
- dashboard tour
- staff roles
- architecture flows

`?static=1`, `?calm=1` and `?present=1` URL flags also work. An OS "reduce motion" setting starts in Calm automatically. If WebGL is unavailable, the page still works as a document.

## Structure

```
dist/                       ← the website (serve this folder)
  index.html                all chapter content and claims; edit text here
  presenter.html            second-screen presenter view
  assets/css/site.css       design system (palette from the app's app_colors.dart; Outfit + Roboto Mono)
  assets/js/deck.js         chapters, scroll mapping, keyboard, steppers, defense mode, dialogs
  assets/js/world.js        the Three.js world (Barili, landmarks, phone, signals, shot director)
  assets/js/content.js      captions and capture notes for every screen; assistant replies (verbatim from source)
  assets/js/three.classic.js  three.js r180 wrapped as a classic script (works from file://)
  assets/js/data/           generated: barangay geometry, screen index, WebGL textures
  assets/img/screens/       byte-identical copies of the supplied screenshots
build/                      one-time helpers to regenerate assets and to test (not needed to present)
```

### Editing content
- **Text and claims:** `dist/index.html`. Each chapter's presenter notes are in its `<template class="ch-notes">`, and its time budget is `data-time` in seconds.
- **Screen captions:** `dist/assets/js/content.js`.

## Regenerating assets and testing (optional)

The build helpers use Python with Pillow, and Node. They're only needed when screenshots change:

```
python -I build/prepare_assets.py    # copy screens unaltered, thumbnails, textures, barangay data, fonts
node build/make_three_classic.mjs    # rebuild three.classic.js from build/vendor
node build/serve.mjs 5180            # test server
node build/verify.mjs                # 39 automated checks
```

The checks cover:
- screenshot hashes against `../assets/screenshots`
- no external references
- 12–15 minute timing
- WebGL start-up
- a full keyboard walk-through
- dialogs and the presenter-window sync
- static, calm and `file://` modes
- five viewport sizes

The last run passed 39/39.

## Accuracy guardrails built in

- Screens are unaltered captures. Annotation numbers are overlays, not edits.
- Withheld captures:
  - `login.jpg` (shows a personal e-mail)
  - `complaints-hearing-queue.png` (shows names in a dispute)
- The 3D relief, buildings and connection lines are labelled illustrative. Boundaries are PSA data, credited in the page.
- Draft problem and objectives are tagged *Draft*. Evaluation shows *Pending* cells; no results are invented.
- The assistant chapter states the facts from source and captures:
  - The three quick inquiries are answered on the phone.
  - Other questions go to a Cloud Function calling Gemini.
  - A cloud answer has not been captured.
- Dashboard counts are labelled as operational records, not findings.
