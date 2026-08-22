# Bolton Trades

Community trader register for the Bolton Tradesmen WhatsApp group. Structured reviews instead of star ratings, Bayesian-shrunk scores, and a paid tier that can never move a trader up the list.

---

## The problem

Every week someone in the group asks for a recommendation, four people reply from memory, and the answer disappears into the scroll. The knowledge is real and it is good — it just isn't searchable, isn't durable, and isn't visible to anyone who joined last month.

The national platforms solved that problem by selling visibility. That is also how they made their reviews worth less. This project is an attempt to solve it the other way round.

## Three rules

These are enforced in the schema, not in a policy page. A rule written in a policy gets broken the first time a paying trader rings up annoyed.

| Rule | How it's enforced |
|---|---|
| Money never moves a rating | The ranking query reads from a view that does not expose the billing columns |
| No trader is listed without consent | `consent_at IS NULL` blocks publication at the query layer |
| Reviews are removed only for cause | Soft delete with a mandatory logged reason; never hard deleted |

Payment buys tools and verification. It does not buy a score, a rank position, or a place in a search result.

## How the rating works

Reviews are six structured questions, not a star box. Specific factual questions get honest answers where a rating widget does not — particularly in a town where everyone knows each other.

| Question | Displayed as |
|---|---|
| Did they turn up when they said they would? | `On time: 91%` |
| Was the final price within the quote? | `Stuck to quote: 86%` |
| Quality of the finished work (1–5) | Headline score |
| Did they leave the place clean? | `Tidy: 95%` |
| **Would you use them again?** | **`Would use again: 88%`** ← the hero number |

The score is never a raw mean. It is shrunk towards the register average until there is enough evidence:

```
score = (v / (v + m)) × R + (m / (v + m)) × C

  R = trader's recency-weighted mean quality (1–5)
  v = number of published reviews
  C = register-wide mean quality
  m = 3
```

Each review is weighted `w = 0.5 ^ (age_months / 24)` — influence halves every two years, so a trader who has slipped recently shows it.

No score is displayed below three reviews. One five-star from a mate is not a rating.

> **On `m = 3`:** tested against a 42-review sample. At `m = 5` the worst trader on the board still displayed as 3.6 — with four reviews the prior drowned out the evidence. At `m = 3` the same trader shows 3.4 and the spread across the board widens from 0.95 to 1.22 points. Revisit once any trader passes 20 reviews.

## Pricing

Free until a trader has received **five enquiries** through the app, then £10/month or £100/year.

The trial ends on delivery, not on a date. A calendar trial fails because in month one most traders receive zero enquiries, you then ask them for money, and they tell the group it didn't work. A trader who tried it and got nothing does more damage than one who never joined.

**Commission on job value is explicitly rejected.** You cannot observe whether a job happened or what it was worth; the number is too visible to swallow (5% of a £5k extension is £250); and it gives the platform a financial reason to nudge the register. None of Checkatrade, MyBuilder, Rated People or Bark charges commission on job value — that is not an oversight in a mature market.

## Status

Honest state of things. Most of this repo does not exist yet.

| Component | State |
|---|---|
| Build specification | Written |
| Rating algorithm | Specified and validated against sample data |
| Clickable prototype | Built (demo data, no backend) |
| Live pilot | Running as a hosted page, ~40KB, self-persisting |
| Production app | **Not started** |
| Payments | Not started — deliberately deferred to Phase 2 |
| Trader consent round | Not started — this is the actual next step |

The pilot exists to answer one question: will people in the group leave reviews at all? Until roughly 25 traders have consented and 60 reviews are in, writing production code is premature.

## Planned stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) | Server-rendered profiles are findable in Google — a free acquisition channel |
| Hosting | Vercel | Free tier is sufficient for a long time |
| Database & auth | Supabase | Postgres with RLS, phone OTP, and storage in one. RLS is what makes the three rules structural |
| SMS | Twilio via Supabase | ~3–5p per UK message |
| Payments | Stripe | Phase 2 only |

Installable as a PWA. iOS install is the biggest drop-off point — it needs an explicit Safari → Share → Add to Home Screen prompt.

Estimated running cost before any revenue: **under £100/year** (domain, ICO fee, SMS).

## Legal obligations

Not optional, and not obvious. Short version:

- **[DMCC Act 2024](https://www.gov.uk/government/publications/fake-reviews-guidance)** — in force 6 April 2025. Publishing consumer reviews requires written policies, a risk assessment, and detection and removal processes for fake reviews. Review gating (inviting only happy customers) and unlabelled incentivised reviews are banned practices.
- **[Defamation Act 2013, s.5](https://www.legislation.gov.uk/uksi/2013/3028/contents/made)** — the operator defence requires following the statutory notice-and-takedown procedure: contact the poster within 48 working hours, 5 days for them to respond, remove if they don't. **This is why anonymous reviews are not permitted** — if you cannot contact the poster, you must remove the statement and you carry the liability.
- **UK GDPR** — a sole trader's name and mobile are personal data. Numbers gathered from the group chat build an outreach list, not a public directory. Consent first, publish second. ICO data protection fee is £52/year (Tier 1).

This is a summary, not legal advice.

## Repo layout

```
docs/
  spec.md          # full build specification
  outreach.md      # consent-round and launch messages
prototype/
  index.html       # self-contained clickable prototype
```

Production application to follow.

## Licence

None yet — all rights reserved by default. Worth choosing deliberately rather than by accident: this is intended as a commercial product, so a permissive open-source licence is probably the wrong call.
