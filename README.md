# Softlife

Conway's Game of Life with cells that merge into soft blobs. An installable web app that works offline.

- **Full screen:** the board runs edge to edge. Tools live on a rail on the right edge: play/pause, colour, draw size, density and speed, random soup, clear, share, patterns and settings. Swipe the rail off the edge to clear the screen and swipe in from the edge to bring it back (remembered). Patterns and settings slide in over the board as panels; nothing resizes the board except density.
- **Play:** tap or drag on the board to draw in the chosen colour; starting a stroke on a live cell erases instead. **Draw size** sets how many dots wide a stroke is (1–7, round); a dashed ring shows the brush. **Density** sets how many dots fit across the screen (12–48). Speed runs from one generation every 3 seconds up to 30 a second.
- **Patterns:** a library of classic spaceships, oscillators and methuselahs. Tap one to drop it onto the board.
- **Settings:** three themes, cell style (goo, dots, pixels; goo has stickiness, colour melt so different colours can join, and gaps for the holes where they meet), colour mode (colonies, solo, age), rule (Conway, HighLife, Day & Night, Seeds, or your own), smooth transitions, critters (long-lived cells open eyes that look around, blink, follow your pointer and doze off), and wrapping edges. Saved in the browser.
- **Your own themes:** Settings → Theme → New. Pick a background and six cell colours (vanilla-colorful picker); text, panels, lines, accent, dots, critter eyes, the solo colour and the age ramp are worked out from them. A colour too close to the background gets a warning and a Fix contrast button. The editor wears the theme as you make it. Saved themes have an edit button; delete one from its editor (with Undo). They stay in the browser.
- **Rule lab:** from Settings → Rule → Make your own rule. Switch neighbour counts on and off for "born with" and "survives with" and watch a preview run the rule on fresh soup, with a hint at how it's doing (lively, filling up, settled down, died out). Mutate flips a switch or two; Surprise me loads a known interesting rule. The preview has its own speed slider (remembered), and the (i) button explains how rules work. Saved rules get a thumbnail, appear in the Settings rule list and stay in the browser. "Born with 0" is never allowed: it makes the whole board flash.
- **Demos:** a small (i) beside every slider and beside Born with / Survives with opens a sheet with an animated scene drawn by the real renderer. Slider scenes sweep through their range on their own (drag to scrub, Auto to resume) with a marker at your setting; the rules player walks through one generation in six steps you can pause, step through and change.
- **Share:** puts the pattern (and rule) in the link; opening the link loads it.
- **Keyboard:** Space plays and pauses, H hides or shows the rail, Escape closes a pop-up or panel.

## Run

```sh
npm install
npm run dev        # local server with live reload
npm test           # simulation, pattern links, saved settings and rules
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ to try the built app (offline mode only works in a build)
```

`dist/` is a static site: host it anywhere (GitHub Pages, Netlify, any web server). It uses relative paths, so a subfolder works too. Installing to a home screen and offline use need HTTPS (or localhost).

## iPhone app

The same code ships as an iOS app through [Capacitor](https://capacitorjs.com): `ios/` is the Xcode project, and it shows the built `dist/` in a web view.

```sh
npm run ios        # build, copy into ios/, open Xcode (then pick a phone and press Run)
npm run ios:sync   # build and copy only, after a web change
npm run icons      # also writes the app icon and launch screen into ios/
```

What's different in the app (`src/native.ts`):
- **Saved data** is mirrored into native storage, because iOS can clear the web view's localStorage. `boot.ts` copies it back before `main.ts` starts. Saving goes through `src/store.ts`.
- **Share** opens the iOS share sheet with a link to the web version (`PUBLIC_URL`), since the app's own address can't be opened anywhere else.
- **Haptics** on starting a stroke, play/pause, soup, clear and dropping a pattern. **Status bar** text follows the theme.
- No service worker: the files are inside the app.

iPhone only, portrait. `ios/App/App/PrivacyInfo.xcprivacy` declares that nothing is collected. The privacy policy is `public/privacy.html`.

The web version is hosted on Render at https://soft-life-nt63.onrender.com. Shared links from the app open there, and the privacy policy is at `/privacy.html`.

## How it's put together

```
src/
  life.ts       the simulation: rules, colonies, ages, resizing, placing patterns (no drawing)
  render.ts     the goo drawing: circles, curved necks between neighbours
  critters.ts   the eyes on long-lived cells: where they go, how they move, blink and react
  brush.ts      the round drawing brush and stroke filling
  drawers.ts    the rail and panels that slide in from the right, and their swipe gestures
  share.ts      pattern ⇄ link (#p=…&r=…), run-length encoded
  settings.ts   saved settings, checked on load
  demos.ts      the animated scenes behind each (i) button, and the step-by-step rules player
  themes.ts     custom themes: the seven picks, working out the rest, saving
  miniboard.ts  a small live board (the Rule lab and theme editor previews)
  boot.ts       entry point: restores saved data in the iOS app, then loads main.ts
  native.ts     the iOS app's differences: storage, share sheet, haptics, status bar
  store.ts      reading and writing saved data
  rules.ts      named rules, saved rules, and the Rule lab's mutate, surprise and trend helpers
  palettes.ts   themes
  patterns.ts   the library
  main.ts       wires the page together: board, drawing, rail, pop-ups, panels, keyboard
public/
  sw.js         offline cache (network first, falls back to the cache)
  manifest.webmanifest, icons/
scripts/
  make-icons.mjs   draws the app icons (npm run icons)
```

Columns come from the density setting (26 by default); rows fill the screen, with the part-rows that don't fit cut evenly at top and bottom. When the screen changes size (rotating the phone, resizing the window), the picture follows immediately and rows are added or removed once it settles, evenly at top and bottom, so the pattern stays centred. Changing density re-grids the same way.
