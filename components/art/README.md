# Bolton art and motion

The marketing pages (`/`, `/for-traders`, `/get-listed`) get their look from a few hand-drawn SVG pieces and CSS
motion. There is no animation library and no image or video asset: everything is vector, so it is sharp on any
screen and weighs a few KB.

## Pieces

| Component | What it is |
| :--- | :--- |
| `Scene` | The hero band: dusk sky (night in dark mode), low sun, `BoltonSkyline` along the bottom, page content on top |
| `BoltonSkyline` | Mills, terraces, the Town Hall clock tower, distant chimneys, lit windows. Decorative |
| `DistrictMap` | BL1–BL7 as hexagons, roughly where they sit. Decorative: the page says the districts in text |
| `LeadFlow` | Three steps as cards with icons. The step text is real text |

Colours come from the `--sky-*`, `--sun`, `--art-*` and `--lit` tokens in `app/globals.css` (light and dark).

## Motion classes (all in `app/globals.css`, "art and motion")

| Class | Effect |
| :--- | :--- |
| `.skyline` | Outlines draw in, silhouettes fill, windows light one by one, on load |
| `.district-map` | Hexagons outline in turn, then fill |
| `.reveal` | Rises into place as it scrolls into view (scroll-driven, where the browser supports it) |
| `.stagger` | Children appear one after another on load (existing) |
| `.scene-sun`, `.skyline` | Gentle parallax while the page scrolls (scroll-driven, where supported) |

## Rules

1. **Complete at rest.** Every animation starts from the finished picture's markup and only plays over it. With
   animation off, unsupported or not yet run, the page is fully drawn and readable. Nothing waits on JavaScript.
2. **Reduced motion wins.** The global `prefers-reduced-motion: reduce` rule switches every animation off.
3. **Only transform and opacity** (plus SVG dash offset on load). No layout properties, so nothing shifts.
4. **Words are text.** Art is `aria-hidden`; anything a visitor needs to read is in the HTML.
5. **The search is never held back.** It is usable the moment the page renders.
