// When a Call or WhatsApp tap counts as an enquiry. Crawlers follow the /api/contact links in a page's HTML (in bursts:
// every trader's Call and WhatsApp within seconds), and they were being counted, so trader dashboards showed enquiries
// nobody made. A tap now counts only when a person pressed the button: the button adds TAP_PARAM to the link as it's
// pressed (withTapMark, used by components/ui/Button.tsx), and browsers mark a navigation the person started themselves
// with Sec-Fetch-User: ?1 (which also covers a press before the page's script has loaded). Anything else is still sent
// on to the number, just not counted. Client-safe.

export const TAP_PARAM = "tap";
export const CONTACT_PATH = "/api/contact/";

/** A contact link with the "pressed by a person" mark added (unchanged for any other link, or when already marked). */
export function withTapMark(href: string): string {
  if (!href.startsWith(CONTACT_PATH)) return href;
  const [path, query = ""] = href.split("?");
  const q = new URLSearchParams(query);
  if (q.get(TAP_PARAM) === "1") return href;
  q.set(TAP_PARAM, "1");
  return `${path}?${q.toString()}`;
}

/** Whether a request to /api/contact came from a person pressing the button, so it counts as an enquiry. */
export function isPersonTap(url: URL, headers: Headers): boolean {
  return url.searchParams.get(TAP_PARAM) === "1" || headers.get("sec-fetch-user") === "?1";
}
