# AIconify

Turn a logo and brand guidelines into a consistent, production-ready icon set, usually for a few cents.

AIconify reads your brand with a cheap vision model, draws the whole set on **one image** so every icon shares the same style, cuts that image into separate icons, traces them to clean 24×24 SVGs and exports SVG, PNG, React components, a sprite and a Figma-ready sheet.

It runs entirely in your browser. There is no server: you connect your own [OpenRouter](https://openrouter.ai) account, and your key, logo and icons never leave your machine except to go to OpenRouter.

## How it works

| Step | What happens | Model | Typical cost |
| --- | --- | --- | --- |
| 1. Brand | Logo colors are measured locally (k-means). The logo image, PDF guideline text and your notes go to a vision model, which returns palette roles, personality, do/don't rules and suggested icons. | `deepseek/deepseek-v4.1-flash` | < $0.001 |
| 2. Style | Pick outline, filled, duotone or badge, plus stroke, corners and colors. This becomes a fixed style block sent with every image prompt. | — | free |
| 3. Generate | The text model writes a one-line visual brief per icon. Up to 16 icons are drawn on one 4×4 sheet. | `openai/gpt-image-2.5-flare` (default) | ~$0.01 per sheet at draft quality |
| 3b. Cut & trace | Connected-component slicing with gutter detection keeps detached parts (the dot of an "i") with their icon. Each crop is centered, snapped to the brand palette and traced to SVG. | runs in the browser | free |
| 4. Review | Approve, rename, or edit an icon with a sentence. Edits and "4 options" send approved icons as style references. | same image model | ~$0.01 each |
| 5. Export | SVG (with `<title>`), PNG at any sizes, typed React components, SVG sprite, Figma sheet, `brand.json`. | — | free |

Image models available (pick per project):

| Model | Transparent output | Reference images | Notes |
| --- | --- | --- | --- |
| GPT Image 2.5 Flare | ✅ | 16 | Default. Best grid following and editing. |
| GPT Image 1 Mini | ✅ | 16 | Cheapest, rougher detail. |
| Recraft V4.1 Flash | — (white background keyed out) | — | Design-tuned look. |
| FLUX.2 Klein 4B | — (white background keyed out) | 4 | Open weights, Apache 2.0. |

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
  exporter.ts     zip builder
src/steps/      the five screens
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
