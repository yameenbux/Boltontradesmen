// What Pro adds, in one place: the public "For traders" page, the dashboard offer and the terms all read it.
// Client-safe. Pro never changes ranking, scores or badges, so nothing here may promise a better position.

export const PRO_PRICE = { monthly: "£10 a month", annual: "£100 a year" } as const;

export type ProFeature = { title: string; text: string };

export const PRO_FEATURES: ProFeature[] = [
  {
    title: "Job requests by text",
    text: "A “Request a quote” button on your page. Customers describe the job and you get a text and an email straight away, so you don't lose work while you're up a ladder.",
  },
  {
    title: "First to hear what Bolton's asking for",
    text: "A text when someone in your areas asks Bolton for your trade, so you can be first to say you can help.",
  },
  {
    title: "Quotes and invoices from your phone",
    text: "Make a quote in two minutes and send it on WhatsApp. Your customer accepts it online; one tap turns it into an invoice with your bank details, and we send the payment reminders.",
  },
  {
    title: "More reviews, without asking",
    text: "When you mark an invoice paid, we ask your customer for an honest review. More reviews build your score.",
  },
  {
    title: "ID checked",
    text: "Once we've seen your photo ID, your page shows “ID checked”.",
  },
  {
    title: "Photos of your work",
    text: "Up to 6 photos on your page.",
  },
  {
    title: "Your enquiries, month by month",
    text: "A monthly report of your calls and WhatsApps on your dashboard.",
  },
];

/** What every listing gets, free, for good. */
export const FREE_FEATURES: string[] = [
  "Your page, with Call and WhatsApp buttons that come straight to you: no lead fees, never sold to anyone else",
  "Reviews from Bolton residents, and your own review link and QR card",
  "Your enquiry count on your dashboard",
  "A “Taking on work” switch, and your “Vouched in Bolton” website badge",
];
