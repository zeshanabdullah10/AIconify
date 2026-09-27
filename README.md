# AIconify

Turn a logo and brand guidelines into a consistent, production-ready icon set, usually for a few cents.

AIconify reads your brand with a cheap vision model, draws the whole set on **one image** so every icon shares the same style, cuts that image into separate icons, and traces them to clean 24×24 SVGs. Line icons come back as real strokes, so their weight can change after the fact. The part of an icon that moves or lights up (a pump's impeller, a valve's disc) can be traced as its own layer, and buttons and HMI states light up just that part. It exports SVG, PNG, EMF, React components, a sprite and a Figma-ready sheet, and for test and automation teams a LabVIEW and HMI pack: button states in four styles, VI icons, equipment states and indicator lamps.

It runs entirely in your browser. There is no server: you connect your own [OpenRouter](https://openrouter.ai) account, and your key, logo and icons never leave your machine except to go to OpenRouter.

## How it works

Three screens, with the next action always in the bar at the bottom.

| Step | What happens | Model | Typical cost |
| --- | --- | --- | --- |
| 1. Set up | Pick the icons (packs for operator panels, test sequencers, instrumentation, process equipment and P&ID come first) and one look: outline, filled, duotone, badge, schematic (P&ID) or 32×32 pixel art, plus weight, stroke, corners, colours, the Industrial HMI look and state parts. A live preview shows sample icons as LabVIEW buttons, at 32/24/16 px and in HMI states before anything is drawn. Optional, folded away: match an existing icon set (up to 8 reference icons), and a brand kit, where the logo, PDF guideline text and notes go to a vision model that returns palette roles, personality, do/don't rules and suggested icons. | `deepseek/deepseek-v4.1-flash` for the brand kit | < $0.001 |
| 2. Draw | The text model writes a one-line visual brief per icon and up to 16 icons are drawn on one 4×4 sheet. Icons not drawn yet show as empty tiles. Each sheet is cut apart (connected components with gutter detection, so the dot of an "i" stays with its icon), snapped to the palette and traced: line work as stroked centerlines at the set's exact width, solid shapes as fills, pixel art on an exact 32×32 grid. Review on the same screen: view the set as icons, as LabVIEW buttons or on dark; approve, rename, or edit an icon with a sentence. The inspector shows the selected icon as a False/True button, a VI icon and in On/Alarm states. Set checks flag icons that are heavier, lighter, off-centre or too detailed for 16 px, each with a suggested fix. | `openai/gpt-image-2.5-flare` (default) | ~$0.01 per sheet at draft quality, ~$0.01 per edit |
| 3. Export | LabVIEW is the default target; add HMI / SCADA, web and design tools as needed. The settings for buttons, VI icons, HMI states and indicators sit next to a preview of the set on a LabVIEW front panel, an HMI screen, a web toolbar and at 16–48 px. Formats, sizes and names are under Files & formats. | — | free |

Image models available (pick per project):

| Model | Transparent output | Reference images | Notes |
| --- | --- | --- | --- |
| GPT Image 2.5 Flare | ✅ | 16 | Default. Best grid following and editing. |
| GPT Image 1 Mini | ✅ | 16 | Cheapest, rougher detail. |
| Recraft V4.1 Flash | — (white background keyed out) | — | Design-tuned look. |
| FLUX.2 Klein 4B | — (white background keyed out) | 4 | Open weights, Apache 2.0. |

### Match an existing icon set

In Set up, open **Match an existing icon set** and drop up to 8 SVG or PNG icons you already use. They are sent to the image model as style references ahead of any icons you've approved, so new sheets follow their line weight and shapes. **Use their color** sets the main color from them. Models without reference support (Recraft) show a warning.

### Line icons as real strokes

Outline, duotone and schematic icons are traced along the middle of each line (distance transform, thinning, then curve fitting) instead of around its edges. The result is smaller, every icon in the set gets exactly the stroke width you chose, and you can switch between light, regular and bold without redrawing. Small PNGs get slightly heavier lines automatically, the way type is cut for small sizes. Colours that aren't line work (a solid shape) fall back to filled tracing, and solid dots stay dots.

### State parts

With **State parts** on, the prompt asks the image model to draw the part of each icon that moves, flows or lights up in a reserved key colour, one far from your brand colours. The tracer turns that colour into a separate layer (`class="active"` in the SVG, handy for CSS too) shown in your accent colour. Buttons and HMI states then change only that layer: a running pump's impeller fills in while the casing stays calm. Icons without such a part still work, using a small badge or lit dot instead. How reliably a model follows this is checked by the live smoke test (`npm run smoke`).

### LabVIEW and industrial HMI

Everything here is drawn in the browser from the traced icons, so it costs nothing extra.

| Option | In the zip |
| --- | --- |
| Densities | `@1.5x` and `@2x` PNGs next to every 1× file, since LabVIEW doesn't rescale images. |
| EMF | Every LabVIEW picture also comes as a Windows vector `.emf` next to its PNG: `emf/*.emf` for the icons, plus button states, VI icons, glyphs, equipment states and indicators. LabVIEW scales them without blurring. They use only solid colours and non-overlapping filled polygons (lines are converted to their exact outlines with [Clipper](https://www.angusj.com/clipper2/Docs/Overview.htm)), so every EMF player draws them the same way, whichever fill rule it applies. |
| Pixel snap | On by default: straight edges land on whole pixels in PNGs of 64 px and below, and in VI icons. Curves are left alone, and bars thinner than a pixel stay one pixel wide. |
| Button states | `labview/buttons/<icon>/{false,true,false-to-true,true-to-false}.png` at 32, 48 or 64 px, for a custom boolean's four pictures. Four styles: **ISA-101** (flat grey, a bar shows the state), **Modern** (tinted face and outline when true), **Classic** (bevelled, stays pressed in) and **Toggle** (a switch with the icon on its knob). Square, or wide with room for LabVIEW's own Boolean text. |
| VI icons | `labview/vi-icons/*.png`: 32×32 with a frame and an optional banner (up to 7 characters in a 3×5 pixel font), plus `labview/glyphs/*.png` for the Icon Editor. Pixel-art icons are used at their own 32×32 grid, without a banner. |
| Equipment states | `states/{normal,on,off,warning,alarm,manual,disabled,offline}/` as SVG (and EMF), with PNGs at 24–64 px. ISA-101 style: on/off change only the active part; warning (triangle), alarm (diamond) and manual (M) add a corner badge whose shape carries the meaning without relying on colour. |
| Indicators | `labview/indicators/`: round and square LEDs and pilot lamps as on/off pairs, and tank levels (0–100%) as frames for a Picture Ring, in signal or brand colors. |

The **Industrial HMI** look in Set up switches to one ISA-101 grey, turns on state parts and adds HMI wording to the prompt. The icon packs include instrumentation, process equipment, P&ID symbols and test sequencer sets. `labview/README.md` in the zip explains how to import each part. Limits: one banner per export; picking every target at once makes a large zip (about 1,500 files for 16 icons), mostly @2x PNGs of every state.

Costs shown in the app are estimates until the call returns; the running total uses the cost OpenRouter reports for each request.

## Use it

Open the hosted app (GitHub Pages, see below), click **Connect** and sign in with OpenRouter, or paste an API key. Giving the key a spending limit on OpenRouter is a good idea.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + unit tests
npm run e2e        # full flow in Chromium (desktop + mobile), OpenRouter mocked
npm run build
```

`npm run e2e` never calls the real API. If Playwright's own Chromium isn't installed, point it at another build with `PW_CHROMIUM_PATH=/path/to/chromium npm run e2e`. To test against the real API (about $0.03–0.08):

```bash
OPENROUTER_API_KEY=sk-or-... npm run smoke
open smoke-output/index.html   # sheets, cut-outs and traced SVGs side by side
```

`SMOKE_MODELS=openai/gpt-image-2.5-flare,recraft/recraft-v4.1-flash npm run smoke` compares other models.

### Project layout

```
src/lib/        framework-free core (runs in Node for tests)
  openrouter.ts   API client, OAuth PKCE, key storage
  prompts.ts      style lock, sheet/edit prompts, JSON parsing and validation
  pipeline.ts     brief → sheet → slice → trace; edits, variations, brand analysis
  slicer.ts       background keying, connected components, gutter detection
  vectorize.ts    palette snapping + tracing to 24×24 SVG
  exporter.ts     one file list for the export screen and the zip
  paths.ts        SVG path parsing, transforms, pixel-grid snapping and optical line widths
  centerline.ts   line work traced as stroked centerlines
  quality.ts      set checks: weight, centring and detail against the rest of the set
  emf.ts          EMF writer: strokes become exact outlines, everything filled polygons
  labview.ts      button skins and states, HMI equipment states, VI icons, import guide
  indicators.ts   LEDs, pilot lamps and tank levels
  samples.ts      hand-drawn sample icons for the live style preview
src/steps/      the three screens: Set up, Draw, Export
src/components/ UI kit (buttons, segmented controls, dialogs)
e2e/            Playwright tests with a mocked OpenRouter
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds with the right base path and publishes to GitHub Pages. Enable it once under **Settings → Pages → Source: GitHub Actions**. Any static host works too: `npm run build` and serve `dist/`.

## Privacy

- Your OpenRouter key is stored in `localStorage` and sent only to `openrouter.ai`.
- Projects (logo, sheets, icons) are saved in IndexedDB in your browser.
- PDFs are read locally; only the extracted text is sent to the text model.
- Production builds ship a Content-Security-Policy that only allows network requests to `openrouter.ai`.

See [SECURITY.md](SECURITY.md) for the security model and how to report a vulnerability.

## License

MIT
