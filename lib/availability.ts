// "Taking on work": a trader's availability, a claim with a shelf life (migration 000028). The database works out
// what still stands when provider_public is read; effectiveAvailability() is the same rule, for the forms that show
// the stored value. Dates are Bolton's (Europe/London) and written by hand, so the server and the browser agree.

export type AvailabilityStatus = "taking" | "booked";

/** What shows: "Taking on work" (until: the last day of "this week", or none) or "Booked up until <until>". */
export type Availability = { status: AvailabilityStatus; until: string | null; setAt: string };

/** "Taking on work" shows for this many days after it was set, unless set again. */
export const TAKING_DAYS = 14;
/** "Booked up until" can be at most this many months ahead. */
export const BOOKED_MAX_MONTHS = 6;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** Today's date in Bolton, "2026-10-16". */
export function londonToday(now: Date = new Date()): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export function addDays(date: string, days: number): string {
  return iso(new Date(utc(date).getTime() + days * DAY_MS));
}

/** Like Postgres's date + interval 'n months': the same day, or the month's last day if it has fewer. */
export function addMonths(date: string, months: number): string {
  const d = utc(date);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d.getUTCDate(), last));
  return iso(first);
}

/** The Sunday that ends the week `date` is in (a Sunday is its own week's end). */
export function endOfWeek(date: string): string {
  const day = utc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, day === 0 ? 0 : 7 - day);
}

/** The dates "Booked up until" may take: tomorrow to six months from today. */
export function bookedRange(now: Date = new Date()): { min: string; max: string } {
  const today = londonToday(now);
  return { min: addDays(today, 1), max: addMonths(today, BOOKED_MAX_MONTHS) };
}

/** Why a "Booked up until" date can't be used, or null when it can. */
export function bookedDateProblem(until: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(utc(until).getTime())) return "Choose the date you're booked up until.";
  const { min, max } = bookedRange(now);
  if (until < min) return "Choose a date after today.";
  if (until > max) return "Choose a date no more than 6 months ahead.";
  return null;
}

/**
 * What still shows of a stored availability (the rule provider_public applies): "taking" for 14 days after it was
 * set, and with a date ("this week") not after that date; "booked" until the end of its date. Otherwise null.
 */
export function effectiveAvailability(
  stored: { status: string | null; until: string | null; setAt: string | null } | null,
  now: Date = new Date(),
): Availability | null {
  if (!stored?.status || !stored.setAt) return null;
  const today = londonToday(now);
  if (stored.status === "taking") {
    const fresh = new Date(stored.setAt).getTime() > now.getTime() - TAKING_DAYS * DAY_MS;
    if (!fresh || (stored.until !== null && stored.until < today)) return null;
    return { status: "taking", until: stored.until, setAt: stored.setAt };
  }
  if (stored.status === "booked" && stored.until && stored.until >= today) {
    return { status: "booked", until: stored.until, setAt: stored.setAt };
  }
  return null;
}

/** "14 Nov" for "2026-11-14". */
export function shortDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** "Taking on work", "Taking on work this week" or "Booked up until 14 Nov". */
export function availabilityLabel(a: Pick<Availability, "status" | "until">): string {
  if (a.status === "booked") return a.until ? `Booked up until ${shortDate(a.until)}` : "Booked up";
  return a.until ? "Taking on work this week" : "Taking on work";
}

/** How fresh it is, in Bolton's days, to follow " · ": "updated today", "updated yesterday", "updated 3 days ago". */
export function updatedAgo(setAt: string, now: Date = new Date()): string {
  const days = Math.max(
    0,
    Math.round((utc(londonToday(now)).getTime() - utc(londonToday(new Date(setAt))).getTime()) / DAY_MS),
  );
  if (days === 0) return "updated today";
  if (days === 1) return "updated yesterday";
  return `updated ${days} days ago`;
}

/** When it stops showing, for the trader's and the admin's forms. */
export function stopsShowing(a: Availability): string {
  if (a.until) return `It shows until the end of ${shortDate(a.until)}.`;
  const last = londonToday(new Date(new Date(a.setAt).getTime() + TAKING_DAYS * DAY_MS));
  return `It stops showing on ${shortDate(last)} unless you set it again.`;
}

/** The stored availability as provider_my_reviews and admin_get_provider return it ("showing" is the view's rule). */
export type StoredAvailability = { status: string | null; until: string | null; set_at: string | null; showing: string | null };

/** What the forms say about the stored value: what shows now, how fresh it is and when it stops, or that it ran out. */
export function availabilityNow(stored: StoredAvailability | null | undefined, now: Date = new Date()) {
  const showing =
    stored?.showing && stored.set_at
      ? ({ status: stored.showing as AvailabilityStatus, until: stored.until, setAt: stored.set_at } satisfies Availability)
      : null;
  return {
    showing,
    updated: showing ? updatedAgo(showing.setAt, now) : null,
    ends: showing ? stopsShowing(showing) : null,
    expired: !showing && !!stored?.status,
  };
}

/** A set_my_availability / admin_set_availability call: a null status clears it. */
export type AvailabilityChoice = { status: AvailabilityStatus | null; until: string | null };

/**
 * Reads the availability form: choice ("taking", "booked" or "none"), this_week (a tick, with taking) and until (the
 * date, with booked). "This week" becomes the Sunday that ends this week in Bolton.
 */
export function parseAvailabilityForm(
  fd: FormData,
  now: Date = new Date(),
): { ok: true; choice: AvailabilityChoice } | { ok: false; field: "choice" | "until"; message: string } {
  const field = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const choice = field("choice");
  if (choice === "none") return { ok: true, choice: { status: null, until: null } };
  if (choice === "taking") {
    return { ok: true, choice: { status: "taking", until: field("this_week") ? endOfWeek(londonToday(now)) : null } };
  }
  if (choice === "booked") {
    const until = field("until");
    const problem = bookedDateProblem(until, now);
    return problem ? { ok: false, field: "until", message: problem } : { ok: true, choice: { status: "booked", until } };
  }
  return { ok: false, field: "choice", message: "Choose one." };
}

/** The database's refusals (migration 000028), in words. Anything else is a plain "try again". */
export const AVAILABILITY_ERRORS: Record<string, { field?: "until"; message: string }> = {
  until_required: { field: "until", message: "Choose the date you're booked up until." },
  until_not_future: { field: "until", message: "Choose a date after today." },
  until_too_far: { field: "until", message: "Choose a date no more than 6 months ahead." },
  not_this_week: { message: "Something went wrong with “this week”. Please try again." },
  not_your_listing: { message: "Your listing isn't live or paused, so availability can't be set." },
  blocked: { message: "Your account can't change your listing. Contact us if you think that's wrong." },
  "provider removed": { message: "A removed listing can't show availability." },
};
