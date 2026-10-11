# Plan 1 follow-ups

Deferred minor findings and parked items from Plan 1 reviews, triaged as safe to defer. Pick up in later plans.

## Fix early in Plan 2
- Refuse any status transition out of `removed` except via a fresh invite and consent (removed → paused → live currently bypasses the go-live rule).
- Reviews: BEFORE DELETE trigger that raises; removal_reason must be non-blank.
- Consent tokens: add an expiry (TTL) before real invites go out.
- Don't log a whatsapp_tap when the provider has no WhatsApp; don't log HEAD/link-preview requests (before Plan 4 shows enquiry counts).

## Deferred minors (from task reviews)
- Task 1: minor (deferred): Playwright webServer rebuilds in CI (use `npm run start` when CI)
- Task 1: minor (deferred): `@playwright/test` "1.64" loose range — pin
- Task 1: minor (deferred): globals.css Arial overrides Geist font variable
- Task 1b: minor (deferred): smoke.test.sh can target non-local env — add same guard
- Task 1b: minor (deferred): db-reset empty-array expansion on bash <4.4
- Task 1b: minor (deferred): proxy doesn't 401 on missing apikey (Kong parity)
- Task 1b: minor (deferred): proxy lacks error handlers on req/upstream
- Task 1b: minor (deferred): start.sh relies on PID files only; port pre-check; mktemp cleanup trap; stop.sh PID verification
- Task 1b: minor (deferred): db-reset guard ignores hostaddr=/PGHOSTADDR/service=
- Task 2: minor (deferred): max-3 race under concurrent inserts (advisory lock)
- Task 2: minor (deferred): [auth.email] enable_signup=true in config.toml — set false for clarity
- Task 2: minor (deferred): test gaps — dvsa_adi trigger test, positive go-live test, auth.users insert fragility
- Task 2: minor (deferred): no positive test for valid dvsa_adi UPDATE
- Task 3: minor (deferred): scoring test comments mislabel provider E; register test depends on empty DB (add comment); tighten 2.6 to round(,2)=2.60; add 3-review boundary and in-date-visible tests
- Task 4: minor (deferred): explicit security_invoker=false in view options
- Task 4: minor (deferred): last_review_at duplicates counted-status filter from provider_stats — comment/helper
- Task 4: minor (deferred): tests — exact checks keys; denial tests as `authenticated`
- Task 4: minor (deferred): db:reset should also drop app schema 'private' rather than migrations being made idempotent
- Task 4: minor (deferred): private wrapper revoke from anon/authenticated explicitly (defence in depth)
- Task 5: minor (deferred): fallback test doesn't assert eq('status','live') args; missing tests (secret unset, XFF first entry, zero-row no-fallback)
- Task 5: minor (deferred): createServiceClient outside try → 500 if env missing
- Task 5: minor (deferred): whatsapp_tap logged when provider has no WhatsApp (inflates count) — refuse in SQL
- Task 5: minor (deferred): HEAD/link-preview bots log events — add non-logging HEAD
- Task 5: minor (deferred): pgTAP — service_role grant untested; enquiry_count denial for anon; GMT boundary case
- Task 6: minor (deferred): ranked should also require reviewCount>=3 + boundary tests
- Task 6: minor (deferred): pass slim card type to client components; unused district arg
- Task 6: minor (deferred): aria-label "Call {businessName}"; search live region
- Task 6: minor (deferred): manifest has no icons (not installable)
- Task 6: minor (deferred): phone-absence e2e should check raw HTML via request.get
- Task 6: minor (deferred): guard messages say [db-reset] when called from e2e-prepare
- Task 7: minor (deferred): toE164 silently drops extensions/trailing chars
- Task 7: minor (deferred): unique_slug race → catch unique_violation & retry
- Task 7: minor (deferred): consent link relative if NEXT_PUBLIC_SITE_URL unset — fail loudly
- Task 7: minor (deferred): e2e-prepare fixed /tmp file → mktemp
- Task 8: minor (deferred): cap p_ip length; token TTL; ConsentForm last-setResult race; Referrer-Policy no-referrer on /consent
- Task 8: minor (deferred): hash excludes appended privacy link text; deploy-between-load-and-submit edge; staging stores placeholders
- Task 9: minor (deferred): README explicit "never NEXT_PUBLIC_ prefix secrets"; layout formatting; PolicyPage key; privacy notice should list processors (Supabase, Vercel) — flag to user for legal review
- Task 9: minor (deferred): how-ratings-work lines 14/25 still present tense; whitespace test; README should say set env for Preview builds too
