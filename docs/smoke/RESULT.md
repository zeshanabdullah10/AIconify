# Live smoke run — 2026-09-27

Command: `npm ci && npm run smoke 2>&1 | tee smoke.log` (run once, branch `claude/blissful-hopper-xcdze1` @ `adc9d46`).
Full console output is in [`smoke.log`](smoke.log); open [`index.html`](index.html) to view sheets and traced icons.

## Pass / fail

| Test | Result | Notes |
| --- | --- | --- |
| DeepSeek V4.1 Flash reads the logo | ❌ FAIL | `SyntaxError: Unexpected non-whitespace character after JSON at position 24 (line 2 column 1)` in `parseJson` (`src/lib/prompts.ts:103`), called from `parseBrand` → `analyzeBrand`. The model returned more than one JSON value / trailing content, and slicing first `{` to last `}` produced invalid JSON. |
| `openai/gpt-image-2.5-flare` draws and we slice a 3×3 sheet | ✅ PASS | 9/9 traced |
| `openai/gpt-image-1-mini` draws and we slice a 3×3 sheet | ✅ PASS | 7/9 traced (threshold is ≥ 7) |

**Totals:** 1 failed, 2 passed (3). Duration 31.65 s.

Because the brand step failed, both image tests ran with the default project palette, not a palette pulled from the logo.

## Cost (as reported by OpenRouter)

| Step | Call | USD |
| --- | --- | --- |
| brand | logo analysis (text) | 0.000648 |
| openai/gpt-image-2.5-flare | icon briefs (text) | 0.000336 |
| openai/gpt-image-2.5-flare | sheet image | 0.007605 |
| openai/gpt-image-1-mini | icon briefs (text) | 0.000318 |
| openai/gpt-image-1-mini | sheet image | 0.002882 |
| **Total** | | **0.0118** |

Per model, the full sheet (briefs + image) cost: gpt-image-2.5-flare **$0.0079**, gpt-image-1-mini **$0.0032**.

## Sliced-icon flags

| # | Icon | gpt-image-2.5-flare | gpt-image-1-mini |
| --- | --- | --- | --- |
| 0 | Home | ok | ok |
| 1 | Search | ok | `fragmented` |
| 2 | Cart | ok | `missing` (no SVG) |
| 3 | Profile | ok | `overlaps-neighbour` |
| 4 | Coffee cup | ok | ok |
| 5 | Leaf | ok | `overlaps-neighbour`, `very-small` |
| 6 | Map pin | ok | ok |
| 7 | Calendar | ok | ok |
| 8 | Gift | ok | `missing` (no SVG) |

Note: `openai-gpt-image-1-mini-5-Leaf.svg` was written but is an empty `<svg>` (66 bytes, no paths), so in practice gpt-image-1-mini produced 6 usable icons out of 9.
