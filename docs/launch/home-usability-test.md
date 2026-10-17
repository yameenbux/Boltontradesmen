# Home page test with 5 residents

The bar the home page has to clear, judged by real Bolton residents rather than by us.

**Pass:** at least 4 of 5 people find a plumber in BL3 and get to the Call or WhatsApp button in under 30 seconds, with no help.

## Before you start

- Run it once at least 3 plumbers who cover BL3 are live. Before that, the test can only check the launch-day message.
- Pick 5 people from the Bolton Tradesmen group who have never seen the site. Mix ages, and include at least one person aged 60 or over.
- They use **their own phone**. Send them the link: https://boltonvouched.ysbdesigns.uk/platform
- Do it in person or on a WhatsApp video call, so you can see the screen. A stopwatch on your phone is enough.

## Script (about 5 minutes each)

Say this, word for word:

> "This is a new website. I'm testing the website, not you. There are no wrong answers. Please think out loud as you go. I won't help, because I want to see where it's unclear."

**1. Five-second look.** Open the page. After 5 seconds, ask them to put the phone face down, then ask:
- "What is this website for?"
- "Does it cost anything to use?"

Write down their words exactly.

**2. The task.** Say: "Your kitchen tap is leaking and you live in BL3. Find someone to fix it and get as far as contacting them. Stop just before the call actually goes through."
- Start the timer when they touch the phone.
- Stop it when they tap **Call** or **WhatsApp**.
- Note their **first tap**, and every place they pause for more than about 3 seconds.

**3. Trust.** On the trader's page, ask:
- "Would you call this person? Why, or why not?"
- "What does 'vouched' mean to you here?"

**4. Last question.** "What one thing would you change?"

## Record (one row per person)

| # | Age band | Five-second answer | Thinks it's free? | First tap | Time to Call/WhatsApp | Where they hesitated | Would call? Why | One change |
|---|----------|--------------------|-------------------|-----------|-----------------------|----------------------|-----------------|------------|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

## Reading the results

- **Pass:** 4 of 5 finish in under 30 seconds without help.
- **The same hesitation from 2 or more people is a real problem.** Fix that first, and report it rather than tweaking how things look.
- **If the five-second answers don't mention trades or Bolton,** the headline isn't doing its job.

## The numbers to watch afterwards

**Search no-match rate.** Run:

```
railway logs | node scripts/search-report.mjs
```

The target is under 10%. The report also lists the searches that found nothing, which are the trades people want and we're missing.

**Contact taps.** The admin provider page shows enquiries (Call and WhatsApp taps) per trader.

**Visits to trader pages.** These come from Cloudflare Web Analytics. It is **not switched on yet**: set `CF_WEB_ANALYTICS_TOKEN` in Railway first.

**Comparing before and after:** compare the two weeks before a change with the two weeks after. Traffic is too low for a reliable A/B test.
