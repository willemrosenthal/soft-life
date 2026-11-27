# Softlife

Conway's Game of Life with cells that merge into soft blobs. An installable web app that works offline.

- **Play:** tap or drag on the board to draw in the chosen colour; starting a stroke on a live cell erases instead. Random soup, step, play/pause, clear, share, and a speed slider (1–30 generations a second).
- **Bigger board:** the handle at the top of the controls folds the colours, controls and speed away so the board fills the screen; the round button in the board's corner brings them back. The choice is remembered.
- **Patterns:** a library of classic spaceships, oscillators and methuselahs. Tap one to drop it onto the board.
- **Settings:** three themes, cell style (goo, dots, pixels), colour mode (colonies, solo, age), rule (Conway, HighLife, Day & Night, Seeds), smooth transitions, critters (long-lived cells open eyes that look around, blink, follow your pointer and doze off), and wrapping edges. Saved in the browser.
- **Share:** puts the pattern (and rule) in the link; opening the link loads it.
- **Keyboard:** Space plays and pauses, H hides or shows the controls.

## Run

```sh
npm install
npm run dev        # local server with live reload
npm test           # simulation, pattern links, saved settings
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ to try the built app (offline mode only works in a build)
```

`dist/` is a static site: host it anywhere (GitHub Pages, Netlify, any web server). It uses relative paths, so a subfolder works too. Installing to a home screen and offline use need HTTPS (or localhost).

## How it's put together

```
src/
  life.ts       the simulation: rules, colonies, ages, resizing, placing patterns (no drawing)
  render.ts     the goo drawing: circles, curved necks between neighbours
  critters.ts   the eyes on long-lived cells: where they go, how they move, blink and react
  share.ts      pattern ⇄ link (#p=…&r=…), run-length encoded
  settings.ts   saved settings, checked on load
  palettes.ts   themes
  patterns.ts   the library
  main.ts       wires the page together: board, controls, dock, sheets, keyboard
public/
  sw.js         offline cache (network first, falls back to the cache)
  manifest.webmanifest, icons/
scripts/
  make-icons.mjs   draws the app icons (npm run icons)
```

The board has a fixed 26 columns; rows follow its height. When the board changes size (folding the controls, rotating the phone), the picture follows immediately and rows are added or removed once it settles, evenly at top and bottom, so the pattern stays centred.
