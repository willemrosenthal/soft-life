# Softlife

Conway's Game of Life with cells that merge into soft blobs. An installable web app that works offline.

- **Full screen:** the board runs edge to edge. Tools live on a rail on the right edge: play/pause, colour, draw size, density and speed, random soup, clear, share, patterns and settings. Swipe the rail off the edge to clear the screen and swipe in from the edge to bring it back (remembered). Patterns and settings slide in over the board as panels; nothing resizes the board except density.
- **Play:** tap or drag on the board to draw in the chosen colour; starting a stroke on a live cell erases instead. **Draw size** sets how many dots wide a stroke is (1–7, round); a dashed ring shows the brush. **Density** sets how many dots fit across the screen (12–48). Speed runs 1–30 generations a second.
- **Patterns:** a library of classic spaceships, oscillators and methuselahs. Tap one to drop it onto the board.
- **Settings:** three themes, cell style (goo, dots, pixels), colour mode (colonies, solo, age), rule (Conway, HighLife, Day & Night, Seeds, or your own), smooth transitions, critters (long-lived cells open eyes that look around, blink, follow your pointer and doze off), and wrapping edges. Saved in the browser.
- **Rule lab:** from Settings → Rule → Make your own rule. Switch neighbour counts on and off for "born with" and "survives with" and watch a preview run the rule on fresh soup, with a hint at how it's doing (lively, filling up, settled down, died out). Mutate flips a switch or two; Surprise me loads a known interesting rule. The preview has its own speed slider (remembered), and the (i) button explains how rules work. Saved rules get a thumbnail, appear in the Settings rule list and stay in the browser. "Born with 0" is never allowed: it makes the whole board flash.
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
