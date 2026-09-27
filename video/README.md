# AIconify product film

A one-minute film about AIconify, made with [Remotion](https://www.remotion.dev). The finished video is [`docs/aiconify-film.mp4`](../docs/aiconify-film.mp4).

Every icon, button, VI icon, HMI state and indicator in the film is drawn by the app's own code in `../src/lib` (the same functions that write the export zip), from a hand-drawn sixteen-icon industrial set in `src/icons.ts`. The soundtrack and sound effects are synthesized by `scripts/music.mjs` in time with `src/timeline.json`, so there are no third-party audio files.

| Scene | What it shows |
| --- | --- |
| Intro | A block-diagram wire plugs into a tile and the first icon draws itself |
| 01 Brand | A logo drops in and is scanned; colors, personality and rules come out |
| 02 Draw | One generated sheet is cut on its gutters and every cell traced to vector strokes |
| 03 Look | The set changes style together, then its line weight sweeps |
| 04 LabVIEW | A front panel: buttons clicked true (only the moving part lights), skins, VI icon banner, LEDs, tank |
| 05 HMI | An ISA-101 overview: running, warning, alarm and manual states |
| 06 Export | Targets are picked and the real zip listing builds up (1,459 files for this set) |
| Outro | The mark, the name, the link |

## Render

```sh
cd video
npm install
npm run render          # writes public/music.wav, then out/aiconify.mp4 (1920×1080, 60 fps)
npm run studio          # scrub and edit in the Remotion Studio
```

In a sandbox without a regular Chrome, point Remotion at a headless shell: `REMOTION_CHROME=/path/to/headless_shell npm run render`.
