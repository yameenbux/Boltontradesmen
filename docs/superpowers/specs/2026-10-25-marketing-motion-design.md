# Marketing pages: Bolton art and motion

**Date:** 25 October 2026. **Status:** built on `feat/marketing-motion`.

## Goal

Make the public pages sell, to both sides of the directory:

- **Traders** list (free), then buy Pro.
- **Residents** contact a trader (the lead), then leave a review. No sign-up is needed to contact anyone, and that
  stays: an account wall before contact would cut leads.

## Decisions

| Decision | Why |
| :--- | :--- |
| Graphics, not photos or AI imagery | The promise is "real neighbours". Stock or generated people read as fake. Real trader photos can be added later |
| Hand-drawn SVG, CSS motion, no animation library | Sharp at any resolution for a few KB; pages stay server-rendered; nothing waits on JavaScript. A library added ~30–35 KB for effects phones mostly can't show (compared in a demo; option 1 chosen) |
| One cinematic scene per page | The hero is the moment; sections below stay calm. Scattered effects look cheap |
| Pages complete at rest | Animations play over the finished markup. With motion off, unsupported or still loading, everything is drawn and readable, for people, search engines and agents |
| Copy cut hard, except lines that do a legal or trust job | Kept: the privacy line at the form, "nothing goes live until you've agreed", "Pro never moves you up the list" |

## What changed

- `components/art/`: `Scene`, `BoltonSkyline`, `DistrictMap`, `LeadFlow`, and a README with the motion rules.
- `app/globals.css`: scene tokens (`--sky-*`, `--sun`, `--art-*`, `--lit`) for light and dark, and the "art and
  motion" block (draw-on, fill, lit windows, scroll reveal, sun parallax).
- Home: the hero is a dusk scene behind the headline and search; the tagline line is gone ("no sign-up" moved into the
  trust pills); a "List your trade free" band invites traders.
- For traders: rebuilt as a sales page: scene with the promise and two buttons, how a job reaches you, the BL1–BL7
  map, the two plans side by side (Pro shows feature titles only), and the fairness line.
- Get listed and its thanks page: shorter copy; the stale "paid upgrade is coming later" lines now describe Pro.

## Not done (deliberately)

- Photos of real traders: when the owner has them, with permission.
- Page-to-page transitions beyond the existing route enter animation.
- An `llms.txt` for agents: the pages are server-rendered text already; revisit after launch, as the site lock would
  hide it today.
