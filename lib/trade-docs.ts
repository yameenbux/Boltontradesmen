// Quotes and invoices (Pro): shared types, money formatting and the editor's checks. Client-safe: the editor imports
// it. The database (save_my_doc) checks the same rules again and works out the total itself.

export type DocKind = "quote" | "invoice";
export type DocStatus = "draft" | "sent" | "accepted" | "declined" | "unpaid" | "paid" | "void";
export type DocLine = { description: string; quantity: number; unit_pence: number };

export type TradeDoc = {
  id: string;
  kind: DocKind;
  number: number;
  token: string;
  status: DocStatus;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  title: string;
  lines: DocLine[];
  total_pence: number;
  notes: string | null;
  until: string | null;
  ask_review: boolean;
  job_request_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  created_at: string;
  sent_at: string | null;
  answered_at: string | null;
  paid_at: string | null;
  /** A quote's deposit, asked by card once accepted (migration 000054). */
  deposit_pence?: number | null;
  deposit_paid_pence?: number | null;
  deposit_paid_at?: string | null;
  paid_by_card?: boolean;
  /** On an invoice made from a quote: the deposit already paid, so left to pay = total - this. */
  paid_upfront_pence?: number;
};

export type Billing = { account_name: string; sort_code: string; account_number: string };

export const MAX_LINES = 30;

export const KIND_TEXT: Record<DocKind, string> = { quote: "Quote", invoice: "Invoice" };

export const STATUS_TEXT: Record<DocStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  unpaid: "Unpaid",
  paid: "Paid",
  void: "Cancelled",
};

/** "Q-0007" or "INV-0012". */
export function docNumber(kind: DocKind, n: number): string {
  return `${kind === "quote" ? "Q" : "INV"}-${String(n).padStart(4, "0")}`;
}

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** 16500 → "£165.00". */
export function money(pence: number): string {
  return GBP.format(pence / 100);
}

/** What someone types for a price ("45", "£45.50", "1,200") → pence, or null when it isn't a price. */
export function parsePence(input: string): number | null {
  const v = input.trim().replace(/^£/, "").replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** A quantity ("1", "2.5") → a number with at most two decimals, or null. */
export function parseQuantity(input: string): number | null {
  const v = input.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n >= 0.01 ? n : null;
}

/** A line's total in pence, rounded as the database rounds it. */
export function lineTotal(l: DocLine): number {
  return Math.round(l.quantity * l.unit_pence);
}

export function docTotal(lines: DocLine[]): number {
  return lines.reduce((t, l) => t + lineTotal(l), 0);
}

/** "12-34-56" for a stored "123456". */
export function sortCode(s: string): string {
  return s.replace(/^(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3");
}

/** Where the customer's copy lives. */
export const publicDocPath = (token: string) => `/d/${token}`;

export const DOC_ERRORS: Record<string, { field?: string; message: string }> = {
  bad_customer: { field: "customer_name", message: "Enter the customer's name." },
  bad_phone: { field: "customer_phone", message: "Enter a UK phone number, like 07700 900123, or leave it empty." },
  bad_email: { field: "customer_email", message: "Enter an email address like name@example.com, or leave it empty." },
  bad_title: { field: "title", message: "Give it a short title, like “New kitchen tap”." },
  bad_lines: { field: "lines", message: "Each line needs a description, a quantity and a price." },
  bad_notes: { field: "notes", message: "Keep the notes to 1,000 characters." },
  bad_date: { field: "until", message: "Choose a date within the next year." },
  bad_deposit: { field: "deposit", message: "A deposit must be at least £1 and no more than the quote's total." },
  locked: { message: "This can't be changed now: it's been accepted, paid or cancelled." },
  pro_needed: { message: "Quotes and invoices come with Pro." },
};

/** What's left to pay on an invoice (its total, less a deposit paid on its quote). */
export function leftToPay(doc: Pick<TradeDoc, "total_pence" | "paid_upfront_pence">): number {
  return Math.max(0, doc.total_pence - (doc.paid_upfront_pence ?? 0));
}
