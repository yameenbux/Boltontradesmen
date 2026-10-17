import Image from "next/image";
import Link from "next/link";
import { CardDeck } from "@/components/site/CardDeck";
import {
  CONTACT_EMAIL,
  DECK,
  FAQ,
  GET_LISTED,
  LISTING_TICKET,
  LISTING_WHATSAPP,
  MAILTO,
  PLATFORM,
  SUPPORT_WHATSAPP_DISPLAY,
  WHATSAPP,
} from "@/components/site/content";
import { Faq } from "@/components/site/Faq";
import { Icon, type IconName } from "@/components/site/icons";
import { Phone } from "@/components/site/Phone";
import { JsonLd } from "@/components/JsonLd";
import { homeJsonLd } from "@/lib/seo";

// The showcase site at "/". Fully static: no data fetching, no cookies. The live directory is at /platform.
export const dynamic = "force-static";

const d = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "search",
    title: "Pick a trade",
    text: "Plumber, cleaner, cakes, a bouncy castle. Then pick your area, BL1 to BL7.",
  },
  {
    icon: "people",
    title: "See who Bolton recommends",
    text: "Every listing shows what we've checked. People are ranked by what reviewers say about the quality of their work.",
  },
  { icon: "phone", title: "Call or WhatsApp", text: "One tap from their page. No sign-up, no forms, no middleman." },
];

const TRADER_POINTS: { icon: IconName; title: string; soon?: boolean; text: string }[] = [
  {
    icon: "pound",
    title: "Free to be listed",
    text: "Your basic listing is free and stays free. An optional paid upgrade is coming later; it never affects your place in the list.",
  },
  {
    icon: "eye",
    title: "You see it first",
    text: "We send you a link showing exactly how you'll appear. Nothing goes live until you've read it and tapped to agree.",
  },
  {
    icon: "reply",
    title: "Reply to your reviews",
    text: "Ask us for your private sign-in link, then reply to every review, so customers hear your side.",
  },
  {
    icon: "scales",
    title: "Nobody pays to rank",
    text: "Not you, not the firm down the road. Your place comes from what your customers say.",
  },
];

const FAIR: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "star",
    title: "Ranked by people",
    text: "The order comes from what reviewers say about the quality of the work. Not adverts, and not who shouts loudest in the group.",
  },
  {
    icon: "shield",
    title: "No score from a lucky few",
    text: "Under three reviews, people are shown as new. A couple of mates' reviews can't put anyone on top.",
  },
  {
    icon: "lock",
    title: "Numbers stay private",
    text: "Traders' phone numbers never appear on the page, and browsing sets no cookies and needs no account.",
  },
];

const IPHONE_STEPS: { icon: IconName; title: React.ReactNode; text: string }[] = [
  { icon: "compass", title: "Open it in Safari", text: "Tap Open the platform on this page." },
  { icon: "share", title: <>Tap Share</>, text: "The square with an arrow, at the bottom (or top) of Safari." },
  {
    icon: "addSquare",
    title: (
      <>
        Tap <kbd>Add to Home Screen</kbd>
      </>
    ),
    text: "Scroll down the list a little if you can't see it.",
  },
  {
    icon: "check",
    title: (
      <>
        Tap <kbd>Add</kbd>
      </>
    ),
    text: "Vouched is now on your Home Screen.",
  },
];

const ANDROID_STEPS: { icon: IconName; title: React.ReactNode; text: string }[] = [
  { icon: "chrome", title: "Open it in Chrome", text: "Tap Open the platform on this page." },
  {
    icon: "dots",
    title: (
      <>
        Tap <kbd>⋮</kbd>
      </>
    ),
    text: "The three dots, top right of Chrome.",
  },
  {
    icon: "install",
    title: (
      <>
        Tap <kbd>Install app</kbd>
      </>
    ),
    text: "On some phones it says Add to Home screen instead.",
  },
  {
    icon: "check",
    title: (
      <>
        Tap <kbd>Install</kbd>
      </>
    ),
    text: "Vouched is now with your other apps.",
  },
];

function Steps({ items, android = false }: { items: typeof IPHONE_STEPS; android?: boolean }) {
  return (
    <ol className="s-how">
      {items.map((s, i) => (
        <li key={i}>
          <span className={`art${android ? " and" : ""}`} aria-hidden="true">
            <Icon name={s.icon} />
          </span>
          <span>
            <b>{s.title}</b>
            <span>{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ShowcasePage() {
  return (
    <main>
      <JsonLd data={homeJsonLd()} />
      {/* ---------- hero ---------- */}
      <section className="s-hero" aria-labelledby="hero-title">
        <div className="s-wrap">
          <span className="s-badge s-in s-in-1">
            <i aria-hidden="true" /> For Bolton, by Bolton · BL1 to BL7
          </span>
          <h1 id="hero-title" className="s-in s-in-2">
            <span>Anyone know a good…?</span> <span className="s-grad">Bolton already does.</span>
          </h1>
          <p className="s-lede s-in s-in-3">
            Every week someone in the group asks for a plumber, a cleaner or a cake. Bolton Vouched keeps the answers in
            one place. People are ranked by what neighbours say about the quality of their work, and nobody can pay
            to move up.
          </p>
          <div className="s-ctas s-in s-in-4">
            <Link href={PLATFORM} className="s-btn s-btn-primary">
              Open the platform <Icon name="arrowRight" />
            </Link>
            <a href="#install" className="s-btn s-btn-ghost">
              Add it to your phone <Icon name="arrowDown" />
            </a>
          </div>
          <p className="s-meta s-in s-in-5">Free · No sign-up to look · Made in Bolton</p>

          <div className="s-fan phone-fan">
            <Phone
              shot="category"
              alt="Sample listing: a list of plumbers on Bolton Vouched"
              className="l"
              sizes="(min-width: 880px) 262px, 38vw"
            />
            <Phone
              shot="home"
              alt="Sample listing: the Bolton Vouched home screen, Trades your neighbours vouch for."
              className="c"
              sizes="(min-width: 880px) 290px, 44vw"
              eager
            />
            <Phone
              shot="profile"
              alt="Sample listing: a plumber's profile with made-up review figures"
              className="r"
              sizes="(min-width: 880px) 262px, 38vw"
            />
          </div>
          <p className="s-sample">Sample listings shown</p>

          <ul className="s-trio">
            <li className="reveal">
              <h2>Find by trade</h2>
              <p>From plumbers and sparkies to cakes and bouncy castles, sorted for your part of Bolton.</p>
            </li>
            <li className="reveal" style={d(0.1)}>
              <h2>Would they use them again?</h2>
              <p>
                One honest number from people who&apos;ve had the work done, not a wall of stars.
              </p>
            </li>
            <li className="reveal" style={d(0.2)}>
              <h2>Call or WhatsApp</h2>
              <p>Straight from their page, in one tap. No account, no forms, nobody in the middle.</p>
            </li>
          </ul>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="s-section" aria-labelledby="how-title">
        <div className="s-wrap">
          <div className="s-head reveal">
            <p className="s-eyebrow">How it works</p>
            <h2 id="how-title">The group&rsquo;s best answers, kept in one place.</h2>
            <p>No more scrolling back through months of messages for the name someone mentioned once.</p>
          </div>
          <ol className="s-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="s-step reveal" style={d(i * 0.1)}>
                <span className="n s-grad" aria-hidden="true">
                  0{i + 1}
                </span>
                <span className="ic" aria-hidden="true">
                  <Icon name={s.icon} />
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- inside: card deck ---------- */}
      <section id="inside" className="s-section" aria-labelledby="inside-title">
        <div className="s-wrap">
          <div className="s-head reveal">
            <p className="s-eyebrow">Inside Bolton Vouched</p>
            <h2 id="inside-title">Everything it does, one card at a time.</h2>
          </div>
          <div className="reveal" style={d(0.1)}>
            <CardDeck cards={DECK} label="Inside Bolton Vouched" />
          </div>
          <p className="s-caption">
            Drag the top card away, or use the arrows. The screens show sample listings.
          </p>
        </div>
      </section>

      {/* ---------- install ---------- */}
      <section id="install" className="s-section" aria-labelledby="install-title">
        <div className="s-wrap">
          <div className="s-head reveal">
            <p className="s-eyebrow">Add it to your phone</p>
            <h2 id="install-title">Keep it on your Home Screen.</h2>
            <p>
              No app store and nothing to update. Add it once and it opens like an app: full screen, with its own icon.
            </p>
          </div>
          <div className="s-install">
            <article className="s-os reveal" aria-labelledby="ios-title">
              <div className="s-os-head">
                <span className="logo" aria-hidden="true">
                  <Icon name="apple" />
                </span>
                <h3 id="ios-title">
                  iPhone<small>In Safari</small>
                </h3>
              </div>
              <Steps items={IPHONE_STEPS} />
            </article>
            <article className="s-os reveal" style={d(0.1)} aria-labelledby="android-title">
              <div className="s-os-head">
                <span className="logo" aria-hidden="true">
                  <Icon name="android" />
                </span>
                <h3 id="android-title">
                  Android<small>In Chrome</small>
                </h3>
              </div>
              <Steps items={ANDROID_STEPS} android />
            </article>
            <div className="s-install-note reveal">
              <div>
                <h3>Opens like an app.</h3>
                <p>
                  Next time someone asks “anyone know a good…?”, it&apos;s one tap away. It opens straight onto the
                  directory, with no browser bars in the way.
                </p>
                <Link href={PLATFORM} className="s-btn s-btn-primary">
                  Open the platform <Icon name="arrowRight" />
                </Link>
              </div>
              <div className="s-home" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <i key={i} />
                ))}
                <span className="s-app">
                  <Image src="/icons/icon-192.png" alt="" width={96} height={96} />
                  Vouched
                </span>
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={`b${i}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- for traders ---------- */}
      <section id="traders" className="s-section" aria-labelledby="traders-title">
        <div className="s-wrap">
          <div className="s-head reveal">
            <p className="s-eyebrow">For traders</p>
            <h2 id="traders-title">Good at what you do? Get vouched.</h2>
            <p>Bolton Vouched is free for the people on it, and you stay in charge of how you appear.</p>
          </div>
          <div className="s-traders">
            <div className="reveal">
              <Phone
                shot="consent"
                alt="Sample listing: the page a trader sees before agreeing, here's how you'll appear on Bolton Vouched"
                sizes="(min-width: 880px) 300px, 72vw"
              />
              <p className="s-sample">Sample listing shown</p>
            </div>
            <div>
              <ul className="s-points">
                {TRADER_POINTS.map((p, i) => (
                  <li key={p.title} className="s-point reveal" style={d(i * 0.08)}>
                    <span className="ic" aria-hidden="true">
                      <Icon name={p.icon} />
                    </span>
                    <div>
                      <h3>
                        {p.title}
                        {p.soon && <em>Coming soon</em>}
                      </h3>
                      <p>{p.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="s-listme reveal">
                <h3>Want to be listed?</h3>
                <p>
                  Fill in a short form and we&apos;ll WhatsApp or call you within 2 working days. You&apos;ll see your
                  listing before anyone else does.
                </p>
                <p>
                  Prefer to message? Raise a support ticket by emailing <a href={LISTING_TICKET}>{CONTACT_EMAIL}</a> or
                  on WhatsApp at{" "}
                  <a href={LISTING_WHATSAPP} target="_blank" rel="noopener noreferrer">
                    {SUPPORT_WHATSAPP_DISPLAY}
                  </a>{" "}
                  with your name, trade and the areas you cover.
                </p>
                <div className="s-listme-ctas">
                  <Link href={GET_LISTED} className="s-btn s-btn-primary">
                    <Icon name="check" /> Request a listing
                  </Link>
                  <a href={LISTING_WHATSAPP} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost">
                    <Icon name="whatsapp" /> WhatsApp us
                  </a>
                  <a href={LISTING_TICKET} className="s-btn s-btn-ghost">
                    <Icon name="mail" /> Email a ticket
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- fair by design ---------- */}
      <section id="fair" className="s-section" aria-labelledby="fair-title">
        <div className="s-wrap">
          <div className="s-head reveal">
            <p className="s-eyebrow">Fair by design</p>
            <h2 id="fair-title">Recommended by people, not by whoever pays.</h2>
          </div>
          <ul className="s-fair">
            {FAIR.map((f, i) => (
              <li key={f.title} className="reveal" style={d(i * 0.1)}>
                <span className="ic" aria-hidden="true">
                  <Icon name={f.icon} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- support ---------- */}
      <section id="support" className="s-section" aria-labelledby="support-title">
        <div className="s-wrap">
          <div className="s-head reveal">
            <p className="s-eyebrow">Support</p>
            <h2 id="support-title">Questions people ask.</h2>
          </div>
          <Faq items={FAQ} />
          <div className="s-stuck reveal">
            <h3>Still stuck?</h3>
            <p>
              Raise a support ticket by emailing <a href={MAILTO}>{CONTACT_EMAIL}</a> or on WhatsApp at{" "}
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
                {SUPPORT_WHATSAPP_DISPLAY}
              </a>{" "}
              and we&apos;ll get back to you.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- final call ---------- */}
      <section className="s-section s-final" aria-labelledby="final-title">
        <div className="s-wrap reveal">
          <h2 id="final-title">
            Who&apos;s good round here? <span className="s-grad">Have a look.</span>
          </h2>
          <div className="s-ctas">
            <Link href={PLATFORM} className="s-btn s-btn-primary">
              Open the platform <Icon name="arrowRight" />
            </Link>
            <a href="#install" className="s-btn s-btn-ghost">
              Add it to your phone <Icon name="arrowDown" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
