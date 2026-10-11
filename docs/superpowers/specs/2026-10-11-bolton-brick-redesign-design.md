# Bolton Brick redesign — design

**Status:** approved by owner (prototype reviewed 2026-10-11) · **Reference:** `docs/design/bolton-vouched-prototype.html` (interactive prototype; the visual source of truth)

Restyle every page of the Plan 1 app to the "Bolton Brick" identity, with motion, without changing what the app does. No new data, routes or features beyond those listed here.

## Goals

- Looks local, established and trustworthy; feels modern and fast.
- Easy for non-technical residents: large type, big tap targets (≥ 48px), plain words, Call reachable in one tap on a profile.
- Motion is subtle, GPU-friendly (transform/opacity only) and fully disabled under `prefers-reduced-motion`.
- Works at 360px wide with no horizontal scroll; light and dark themes.

## Identity

- **Colour tokens** (CSS custom properties, light and dark sets exactly as in the prototype's `:root` blocks): `--bg, --surface, --surface-2, --ink, --ink-2, --ink-3, --line, --brick, --brick-deep, --brick-tint, --hero, --on-brick, --sage, --sage-tint, --gold, --shadow`. Exposed to Tailwind via `@theme inline`.
- **Type:** Gloock (display, headings and big numbers) and Figtree 400/500/600/700 (everything else), loaded with `next/font/google`. Body 17px / 1.5.
- **Brand mark:** "BV" monogram on a brick tile with a mortar line, beside the wordmark "Bolton Vouched" and the tagline "Recommended by Bolton".
- **Hero:** brick panel with a subtle running-bond brick pattern drifting slowly; headline **"Who's good round here?"**.
- **Theme:** follows the system by default; a header toggle sets `data-theme` on `<html>` and remembers the choice in `localStorage` (wrapped in try/catch). An inline script in `<head>` applies the stored choice before paint.
- **Footer** on every page: Privacy · Terms · How ratings work, and "Bolton Vouched is operated by YSB Ventures Ltd." (company name from `OWNER_LEGAL_NAME`, falling back as `policyIdentity()` does; no address).

## Motion

- Page enter: `app/template.tsx` wraps each route in an element with a 380ms slide-and-fade enter animation.
- Lists and grids: staggered rise (60ms steps, max 8 items), from a visible resting state.
- Buttons and cards: press scale 0.97; hover lift on pointer devices; tap ripple on primary buttons.
- Numbers: "Would use again" percentages count up from 0 over 900ms when they first render; the server-rendered value is the final number (no flash of 0 without JS).
- Bars: sub-score bars fill from 0 on mount.
- Home search: placeholder rotates every 2.4s through example searches ("plumber", "bouncy castle", "birthday cake", "man and van", "boiler service", "driving lessons"); pauses on focus.
- Sticky action bar on profile and consent slides up on mount.
- All of the above off under `prefers-reduced-motion: reduce`.

## Pages

**Home (`/`)**
- Hero with search. Search submits client-side: an exact or partial category-name match navigates to `/c/[slug]`; otherwise shows an inline "No trade called … yet" message with a link to browse.
- Trust strip: Real locals · Checked · Fair (copy as prototype).
- "Most asked for": up to 8 tiles for categories with ≥ 1 live provider, ordered by live-provider count desc then name; each tile has an icon, name and "N local pro(s)". If fewer than 1 qualifies, show a friendly empty state ("We're adding Bolton's first pros now").
- "Everything else": one collapsible group per category group with "· N with pros"; chips link to categories with providers (count shown) and show "soon" (not a link) for empty ones.
- "How it works" three steps (copy as prototype; step 3 says reviews are coming soon until Plan 2 ships).

**Category (`/c/[category]`)**
- Back link, Gloock title (category name, pluralised by the existing name), subline "N local pros · ranked by people who'd use them again".
- Area chips (All of Bolton + BL1–BL7, M26, M28, M46, WN2), client-side filter with an empty-state message.
- Guidance note (e.g. electrician) as a gold-icon note.
- Ranked provider cards: avatar initials, name, Verified pill, areas, big Gloock percentage "would use again", review count. "New on Bolton Vouched" section with tag "Under 3 reviews" and cards showing "N reviews so far" / "No reviews yet".

**Profile (`/p/[slug]`)**
- Centred header: initials avatar, Gloock name, contact name and trade, Verified pill, "Covers …".
- Stat card: big Gloock "Would use again" percentage with "From N reviews by Bolton residents"; bars for on time, stuck to the quote, tidy (when present); quality stars when a score exists. Under 3 reviews: a calm card "3 reviews needed for a score" with "N reviews so far".
- "What we've checked" list: one row per check (tick for ID/insurance/accreditation with dates; dash row "Trade accreditations · None provided" when none). Replaces the one-line checks summary.
- About card when bio exists.
- Sticky action bar: "Call {first name}" (brick) and WhatsApp (sage outline, only if `has_whatsapp`), both plain `<a rel="nofollow">` to `/api/contact/[slug]?via=…`.
- No review list yet (Plan 2).

**Consent (`/consent/[token]`)**
- Summary card ("{contact first name}, here's how you'll appear on Bolton Vouched"; business, trade(s), areas, contact buttons note).
- The consent statement rendered as icon cards. `lib/consent-text.ts` wording is updated to the prototype's plain-English cards, which still cover every required point (listing data; reviews published without approval and not removed for disagreement; right to reply; withdraw any time, removed within one working day, reviews hidden and restored; ranking from reviews only; privacy notice acknowledgement; controller line naming the operator and contact). `CONSENT_TEXT_VERSION` becomes `2026-10-11b`; the SHA-256 evidence is computed from exactly the rendered statement as today.
- Sticky "I agree, list me" button; success state with an animated drawn tick and "You're all set, {first name}".
- Invalid state keeps "This link is no longer valid".

**Policy pages, 404, admin**
- Policy pages and a new branded `not-found.tsx` use the new type and tokens; draft banner kept.
- Admin (login, list, provider form) restyled with the same tokens and components; layout and behaviour unchanged.

## Components (new or replaced)

`BrandBar`, `ThemeToggle`, `SiteFooter`, `Hero` + `HomeSearch`, `TrustStrip`, `CategoryTile`, `CategoryGroups`, `AreaFilter` + `ProviderList`, `ProviderCard`, `CountUp`, `StatCard` (+ bars), `ChecksList`, `ActionBar`, `Pill`, `Button`, `CategoryIcon` (inline SVG map by category slug with a generic fallback).

## Data

- `listCategoryGroups()` additionally returns `liveCount` per category, computed from `provider_public.category_slugs` (no schema change).
- Everything else reads existing functions and the existing view.

## Out of scope

Review submission and review lists (Plan 2), native apps, new admin features, Figma file (pending a Figma upgrade).

## Testing

- Update unit and E2E tests whose copy or structure changed; keep all security assertions (no phone digits in public HTML, 404s, admin guard, consent flow).
- New E2E: home tiles show only categories with providers and their counts; search "plumb" navigates to `/c/plumber`; area filter hides non-matching cards; theme toggle sets `data-theme`; reduced-motion run has no animations (computed `animation-name` is `none` on a staggered card).
- No horizontal scroll at 360px on home, category, profile, consent (E2E assertion on `scrollWidth`).
