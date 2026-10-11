# Bolton Brick Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to the approved Bolton Brick design, with motion, without changing behaviour.

**Architecture:** Design tokens as CSS custom properties in `app/globals.css` exposed to Tailwind 4 via `@theme inline`; fonts via `next/font/google`; small client components only where interaction or motion needs JS (theme toggle, search, area filter, count-up, consent form). Server components keep reading the existing data layer.

**Tech Stack:** existing Next.js 16, Tailwind 4, Vitest, Playwright. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-11-bolton-brick-redesign-design.md`. **Visual source of truth:** `docs/design/bolton-vouched-prototype.html` — copy its tokens, spacing, radii, shadows, copy and keyframes.

## Global Constraints

- Colour tokens and values exactly as the prototype's three `:root` blocks (light, `prefers-color-scheme: dark` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`).
- Fonts: Gloock (display) and Figtree 400/500/600/700 via `next/font/google`; CSS vars `--font-display`, `--font-body`.
- All motion uses transform/opacity only and is disabled under `prefers-reduced-motion: reduce`.
- Tap targets ≥ 48px; body text ≥ 16px; no horizontal scroll at 360px.
- Phone numbers never in public HTML; contact links stay `/api/contact/[slug]?via=call|whatsapp`, plain `<a rel="nofollow">`.
- Public pages keep `revalidate = 300` and stay cookie-free.
- Code term "provider", never "trader". Footer: "Bolton Vouched is operated by {OWNER_LEGAL_NAME}." (via `policyIdentity()`), no address.
- Don't read `node_modules/next/dist/docs` claims from memory: AGENTS.md says Next 16 differs — check its docs for `template.tsx`, `next/font`, `not-found.tsx` before using them.

## Review Focus

1. **Theme flash:** stored dark choice must apply before first paint (inline head script) — E2E: set localStorage then reload, `data-theme` present on first `DOMContentLoaded`. (Task 1)
2. **Count-up with JS disabled or reduced motion** shows the real number, never 0. (Task 4 unit test of `CountUp` initial render)
3. **Search with no match** gives a helpful message, not a dead end; search with leading/trailing spaces and mixed case matches. (Task 2)
4. **Category with zero live providers** reached by URL still renders a friendly empty state, not a broken grid. (Task 3)
5. **Consent text change** keeps the evidence hash computed from exactly what's rendered; old-version tests updated, not deleted. (Task 5)

---

### Task 1: Foundations — tokens, fonts, theme, shell, motion utilities

**Files:** Modify `app/globals.css`, `app/layout.tsx`, `components/SiteFooter.tsx`. Create `app/template.tsx`, `components/BrandBar.tsx`, `components/ThemeToggle.tsx`, `components/ui/Button.tsx`, `components/ui/Pill.tsx`, `app/not-found.tsx`, `e2e/shell.spec.ts`.

**Interfaces — Produces:** CSS classes `stagger` (children rise in sequence), `press`, `lift`, `display` (Gloock); `Button({ href?, variant: 'primary'|'secondary', children, ...})` rendering `<a>` or `<button>` with ripple on primary; `Pill({ tone: 'sage'|'gold', children })`; `BrandBar()`; `ThemeToggle()` (client); `SiteFooter()` with operator line.

- [ ] Write failing E2E `e2e/shell.spec.ts`: header shows "Bolton Vouched" and "Recommended by Bolton"; footer contains "operated by" and the configured `OWNER_LEGAL_NAME`; clicking the theme toggle sets `html[data-theme]` and it persists after reload (no flash: attribute present when `DOMContentLoaded` fires); unknown route shows branded 404 with a link home and status 404; no horizontal scroll at 360px on `/`.
- [ ] Implement tokens, fonts, `@theme inline` mapping (`--color-bg` etc.), base styles, keyframes (`rise`, `drift`, `vt-in`, `rip`, `draw`), utilities, reduced-motion block, `template.tsx` enter animation, inline theme script, components.
- [ ] Run unit + e2e; lint; typecheck. Commit `feat(ui): Bolton Brick foundations, theme and shell`.

### Task 2: Home page

**Files:** Modify `app/page.tsx`, `lib/directory.ts` (+ test). Create `components/home/Hero.tsx`, `components/home/HomeSearch.tsx` (client), `components/home/TrustStrip.tsx`, `components/home/CategoryTile.tsx`, `components/home/CategoryGroups.tsx`, `components/CategoryIcon.tsx`, `lib/category-search.ts` (+ unit test), `e2e/home.spec.ts` (replace home assertions in `e2e/directory.spec.ts`).

**Interfaces:** `listCategoryGroups()` items gain `liveCount: number`; `popularCategories(groups, limit = 8)` → categories with liveCount ≥ 1 sorted by liveCount desc, name asc; `matchCategory(query, categories): Category | null` (trim, case-insensitive, prefix then substring on name and slug).

- [ ] Failing unit tests: `matchCategory('  PLUMB ', cats)` → plumber; `matchCategory('cake', …)` → cakes; `matchCategory('xyz', …)` → null; `popularCategories` ordering and limit; `liveCount` derived from `category_slugs`.
- [ ] Failing E2E: tiles only for categories with live fixture providers, with "N local pro(s)"; empty categories appear as "soon" chips that aren't links; submitting "plumb" goes to `/c/plumber`; "zzz" shows the no-match message with a browse link.
- [ ] Implement per prototype (hero brick pattern, rotating placeholder, trust strip, tiles, groups, how-it-works with step 3 "Reviews are coming soon"). Run tests; commit `feat(ui): home redesign`.

### Task 3: Category page

**Files:** Modify `app/c/[category]/page.tsx`, `components/ProviderCard.tsx`, `components/DistrictFilter.tsx` → replace with `components/category/AreaFilter.tsx` (client) and `components/category/ProviderList.tsx`. Create `components/CountUp.tsx` (client) + unit test. Update `e2e/directory.spec.ts`.

**Interfaces:** `CountUp({ to: number })` renders `to` on the server/first paint, animates 0→to on mount unless reduced motion.

- [ ] Failing tests: `CountUp` initial render text equals `to` (Review Focus 2); E2E: ranked card shows percentage + "would use again" + "N reviews"; newcomer section titled "New on Bolton Vouched" with tag "Under 3 reviews"; area chip filters cards and shows empty-state text when none match; category with no live providers shows an empty state (Review Focus 4); guidance note visible on electrician.
- [ ] Implement per prototype. Run tests; commit `feat(ui): category redesign`.

### Task 4: Profile page

**Files:** Modify `app/p/[slug]/page.tsx`, `lib/checks.ts` (+ test). Create `components/profile/ProfileHeader.tsx`, `components/profile/StatCard.tsx`, `components/profile/ChecksList.tsx`, `components/profile/ActionBar.tsx`. Remove `components/ChecksRow.tsx`, `components/StatsBlock.tsx`, `components/ContactButtons.tsx` if unused. Update E2E.

**Interfaces:** `checkRows(checks): { kind, title, detail, ok: boolean }[]` — e.g. `{title:'ID checked', detail:'October 2026', ok:true}`, `{title:'Public liability insurance', detail:'Valid until March 2027', ok:true}`, and a final `{title:'Trade accreditations', detail:'None provided', ok:false}` when no accreditation kinds present.

- [ ] Failing unit tests for `checkRows` (exact strings above). Failing E2E: stat card shows "Would use again" and the percentage; under 3 reviews shows "3 reviews needed for a score"; checks list rows; action bar "Call Alan" link href `/api/contact/e2e-ace-plumbing?via=call`; WhatsApp only when available; still no `+44`/`07` digits in raw HTML (`request.get`).
- [ ] Implement per prototype. Run tests; commit `feat(ui): profile redesign`.

### Task 5: Consent page

**Files:** Modify `lib/consent-text.ts` (+ tests), `app/consent/[token]/page.tsx`, `app/consent/[token]/ConsentForm.tsx`; update `supabase/tests/admin.test.sql` only if it hard-codes the version; update `e2e/consent.spec.ts`.

**Interfaces:** `consentStatement()` keeps its signature; returns the new paragraphs (one per card: listing, reviews, leaving, fairness, privacy acknowledgement, controller line) and `version: '2026-10-11b'` with the SHA-256 of `paragraphs.join('\n\n')` as today.

- [ ] Failing unit tests: version `2026-10-11b`; statement contains "without your approval", "simply because you disagree", "within one working day", "come back if you list again", "I have read the privacy notice", "operated by", "data controller"; does not contain "tradespeople". E2E: summary card with business, trade, areas; cards render every paragraph; "I agree, list me" leads to "You're all set"; reused link shows "This link is no longer valid".
- [ ] Implement per prototype. Run tests; commit `feat(ui): consent redesign`.

### Task 6: Policy pages and admin restyle

**Files:** Modify `components/PolicyPage.tsx`, `app/privacy|terms|how-ratings-work/page.tsx` (styles only), `app/admin/**` and `components/admin/**` (styles only).

- [ ] Existing E2E for policies and admin must pass unchanged in behaviour (update selectors only if markup changed); add a 360px no-horizontal-scroll check for `/privacy` and `/admin/login`.
- [ ] Implement: Gloock headings, token colours, draft banner as a gold note, admin cards/forms/buttons using `Button`/`Pill`. Run the full suite (lint, typecheck, unit, db, stack, e2e); commit `feat(ui): policy and admin restyle`.

## Done when

All pages match the prototype's look and motion, reduced-motion disables animation, the full test suite passes locally and in CI, and PR is merged to `main`.

---

## Added by owner request (2026-10-11, late): showcase site + platform at /platform

Owner: "boltonvouched.ysbdesigns.uk will showcase the platform similar to Tidemark (tidemark.ysbdesigns.uk); boltonvouched.ysbdesigns.uk/platform shows the live platform, and is the link users add to their Home Screen as a PWA. The main website has a button to the platform. Design it the same way as the Tidemark website."

### Task 7: Move the platform under /platform and make it an installable PWA

**Files:** move `app/page.tsx` → `app/platform/page.tsx`, `app/c/[category]` → `app/platform/c/[category]`, `app/p/[slug]` → `app/platform/p/[slug]`, `app/consent/[token]` → `app/platform/consent/[token]`; keep `app/api/contact/[slug]`, `app/admin/**`, policy pages at the root. Create `app/platform/layout.tsx` (BrandBar + footer for platform pages only — root layout becomes minimal so the showcase site can have its own chrome). Modify `app/manifest.ts`, all internal links, admin "copy consent link" URL, `lib/*` URL helpers, e2e specs, `next.config.ts` (permanent redirects from old paths: `/c/:category` → `/platform/c/:category`, `/p/:slug` → `/platform/p/:slug`, `/consent/:token` → `/platform/consent/:token`). Create `public/icons/` (192, 512, maskable 512, apple-touch 180 PNGs of the BV monogram on brick) and add `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color` metadata on platform pages.

**Interfaces:** `platformPath(...segments)` in `lib/paths.ts` returns `/platform/...`; every link and the consent-link builder use it.

- [ ] Failing E2E: `/platform` shows the home (hero "Who's good round here?"); `/c/plumber` 308-redirects to `/platform/c/plumber`; `/p/<slug>` and `/consent/<token>` redirect likewise; manifest has `start_url: "/platform"`, `scope: "/platform"`, `display: "standalone"`, name "Bolton Vouched", theme colour = brick, icons 192/512/maskable; `/platform` HTML has `<link rel="apple-touch-icon">`; admin consent link contains `/platform/consent/`.
- [ ] Implement; full suite; commit `feat: platform under /platform, installable PWA`.

### Task 8: Showcase website at / (Tidemark-style)

Reference: https://tidemark.ysbdesigns.uk/ — replicate its structure and polish, in Bolton Brick colours with a dark hero (deep brick-charcoal background, subtle dotted grid, warm gradient glow), two-line headline where line two is a warm brick→gold gradient, centred intro, two pill buttons, a meta line, and three fanned phone mockups showing REAL screenshots of the platform.

**Sections (in order):** nav (logo + How it works · Inside · For traders · Support · Privacy, and an "Open the platform" pill); hero ("Anyone know a good…?" / "Bolton already does." — or similar, owner-voice; primary button **Open the platform** → `/platform`, secondary **Add it to your phone**); meta line "Free · No sign-up · Made in Bolton"; "How it works" (3 steps); "Inside Bolton Vouched" swipeable card deck like Tidemark's (cards: find by trade, area filter, would-use-again score, what we've checked, call or WhatsApp in one tap, fair ranking, reviews coming soon) using real screenshots; "Add it to your Home Screen" (iPhone Safari: Share → Add to Home Screen; Android Chrome: ⋮ → Install app / Add to Home screen; button opens `/platform`); "For traders" (free listing, you approve how you appear, reviews you can reply to, nobody pays to rank, "Want to be listed? Message Yameen" → `mailto:yameen@ysbdesigns.uk` plus a line about messaging in the WhatsApp group); "Fair by design" (3 points); Support FAQ with live search filter (questions: how are people ranked, is it free, how do I get listed, how do I get removed, can a trader pay to rank higher, who runs it, how do I report a review/problem); footer with Privacy · Terms · How ratings work, "Bolton Vouched is operated by YSB Ventures Ltd, registered in England and Wales, company number 16022339." and contact email.

**Files:** `app/(site)/page.tsx` (root `/`), `app/(site)/layout.tsx` (site chrome, dark theme), `components/site/*`, `public/shots/*.webp` (generate with a Playwright script `scripts/shots.mjs` against the local app + e2e fixture data at 390×844 @2x, then convert to webp; commit the script and images). Policy pages keep working under the platform chrome or site chrome (either is fine; links must work).

- [ ] Failing E2E: `/` shows the hero, an "Open the platform" link to `/platform`, nav anchors scroll to sections, FAQ search filters questions and shows "No questions match" for nonsense, footer shows the company number, no horizontal scroll at 360px, reduced motion disables animations, page is static.
- [ ] Implement; full suite; commit `feat: Tidemark-style showcase site`.
