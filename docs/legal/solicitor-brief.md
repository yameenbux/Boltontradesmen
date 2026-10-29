# Bolton Vouched: brief for a solicitor's review

Prepared 29 October 2026 so a fixed-fee review can be quick. Everything below describes the live site at
https://www.boltonvouched.co.uk. The policy pages are marked "Draft — pending legal review" until this review is done.

## Who we are

- Operator: **YSB Ventures Ltd** (company number 16022339, England and Wales), trading as YSB Designs. Contact:
  support@ysbdesigns.uk.
- A small local directory of trades and services in Bolton. One director runs it, with no staff.

## What the site does

| Who | What they do | Money |
|---|---|---|
| Residents | Search for traders free, call or WhatsApp them, leave reviews (signed in), ask and answer questions ("Ask Bolton"), request quotes from Pro traders | Free |
| Traders | List their business free; it goes live straight away and the admin checks it afterwards | Free |
| Pro traders | Optional extras: quote requests, alerts, quotes and invoices, ID check, work photos, insights | £10/month or £100/year, through Stripe Billing. No VAT is charged (not VAT-registered). |
| Pro traders' customers | Open quotes and invoices by link; can pay by card through the trader's own Stripe account (Stripe Connect, direct charges, **we take no fee**) or the trader's own payment link (SumUp, PayPal and the like) | Paid to the trader, never through us |

Also:
- **Reviews:** star-free structured reviews, combined into a score. Paying never changes ranking.
- **Fake reviews:** a fake-reviews policy, device signatures on reviews, and optional proof uploads.
- **Facebook spotlights:** once the admin has checked a new listing, a post about it goes on the Bolton Vouched Facebook page automatically (scheduled through Metricool). It uses only public listing facts and never a phone number.
- **Traders' consent:** each trader agrees to a consent statement when they list. The statement is versioned and hashed as evidence.

## Pages to review

- Terms: /terms
- Privacy notice: /privacy
- Cookies: /cookies
- Review policy: /review-policy
- Fake reviews policy: /fake-reviews-policy
- How ratings work: /how-ratings-work
- The consent statement traders agree to, on the sign-up form and at /consent/<token>
- The Pro offer on /for-traders

## Specific questions

1. **Consumer law and the DMCC Act 2024.** Do the review policy, fake-reviews policy and "how ratings work" meet the duties for platforms that publish consumer reviews (preventing and removing fake reviews, not hiding negative ones)? Is anything missing, such as how we handle reviews from people connected to a trader?
2. **Connected traders.** One listed business (Bux Travel) belongs to a family member of the director. Its Facebook spotlight carries no disclosure, by the owner's choice. Does this need a disclosure on the listing or in posts?
3. **Pro terms (B2B or consumer?).** Pro buyers are sole traders and small businesses. Are the auto-renewal, cancellation, refund (none for part-used periods, a full refund if ID is rejected) and price-change terms fair and enforceable? Do the Consumer Contracts Regulations cancellation rights apply to any of them?
4. **Promises that depend on settings.** Some Pro features appear in the terms only while the service behind them runs. Text alerts need SMS set up, and payment reminders need a daily job. Is a contract that shows different wording depending on configuration acceptable? Should we version the terms per change instead?
5. **Lawful bases.** Consent for publishing a listing. Legitimate interests for enquiry counting, page views, the security check, the review request after an invoice is paid, and the Facebook spotlights. Are these the right bases? Is a legitimate interests assessment needed on file for each?
6. **Messages to traders' customers.** We email a trader's customer about their own quote or invoice: a copy, up to two payment reminders, and one review request after payment (the trader can switch it off). Is the review request a "marketing" message under PECR? Does it need a soft opt-in or consent?
7. **International transfers.** The database is in London, the web server in Frankfurt. Resend, Stripe, Twilio (when switched on), Cloudflare and Metricool may process data in the EU or the US. Is the privacy notice's wording on transfers sufficient, and which mechanism should each service be named under?
8. **Processors.** Do we need signed data processing terms with each processor (Supabase, Render, Resend, Stripe, Cloudflare, Metricool, Sentry, Twilio)? Most have standard DPAs to accept online. Which are missing?
9. **Liability.** Are the limits in "Work done by providers" and "Our liability" enforceable for a free directory and for the paid Pro service?
10. **ICO registration.** Does YSB Ventures Ltd need to pay the data protection fee?

## What the site does not do (to save time)

- No cookies for visitors who only browse. Sign-in cookies are set only after sign-in.
- No advertising and no selling of data or leads.
- No money passes through us for jobs.
- Texts are not switched on today: everything goes by email.
