# Security

AIconify is a static web app with no server of its own. Everything runs in the browser, and the only outside service it talks to is OpenRouter.

## Reporting a vulnerability

Please report it privately through GitHub's **Report a vulnerability** button on this repository's **Security** tab, not in a public issue. Include steps to reproduce and what an attacker could do with it.

## What the app protects

- **Your OpenRouter key** is stored in this browser's `localStorage` and sent only to `https://openrouter.ai`. Anyone with access to your browser profile, or any script running on the same origin, can read it, so give the key a spending limit on OpenRouter and use **Disconnect** on shared machines.
- **Content Security Policy.** Production builds ship a CSP that allows scripts only from the app's own origin and network requests only to itself and `openrouter.ai`. Injected script cannot run, and page content cannot be sent anywhere else.
- **OAuth sign-in** uses PKCE (S256). The app finishes a sign-in only if the same tab started it, so a crafted `?code=` link cannot connect you to someone else's OpenRouter account.
- **Uploaded files.** Logos, SVGs included, are redrawn to a PNG on a canvas before they are stored or shown, and are always displayed through `<img>`. Their markup never goes into the page. PDFs are parsed in the browser, and only their text is sent to the model.
- **Generated SVGs** come from the app's own tracer, which writes only `<path fill d>` elements. Model output is never inserted into the page as HTML.
- **Reference icons** you upload to match an existing set are redrawn to PNG like logos, and only that PNG is stored or sent to the image model.
- **Exported drawings** (button states, VI icons, status variants, indicators, EMF) are built from those same paths. Every color that goes into their markup is checked as a `#rrggbb` hex value first (`safeHex`), and VI icon banner text is drawn as pixel squares from a fixed font, so neither a typed color nor banner text can add markup to an SVG.

## Out of scope

- Content the AI models generate, and OpenRouter's own handling of your data (see OpenRouter's privacy policy).
- Attacks that need control of your browser or device.
