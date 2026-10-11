export type Check = { kind: string; expires_on?: string | null; checked_at?: string | null };

/** One row of the profile's "What we've checked" list. `ok: false` is the dash row. */
export type CheckRow = { kind: string; title: string; detail: string; ok: boolean };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ACCREDITATION_TITLES: Record<string, string> = {
  gas_safe: "Gas Safe registered",
  dvsa_adi: "DVSA approved driving instructor",
  food_hygiene: "Food hygiene certificate",
  pipa: "PIPA inspected",
  niceic_napit: "NICEIC/NAPIT registered",
  dbs: "DBS checked",
  other: "Other accreditation",
};

function monthYear(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

/** "Valid until March 2027", else "Checked October 2026", else "Checked". */
function validity(c: Check): string {
  const until = monthYear(c.expires_on);
  if (until) return `Valid until ${until}`;
  const when = monthYear(c.checked_at);
  return when ? `Checked ${when}` : "Checked";
}

/** The most recent record of a kind (the public view orders checks by checked_at ascending). */
function latest(checks: Check[], kind: string): Check | undefined {
  return checks.filter((c) => c.kind === kind).at(-1);
}

/**
 * Rows for "What we've checked": ID, insurance, then one row per accreditation; when there are no
 * accreditations, a final dash row "Trade accreditations · None provided". Expired checks never reach
 * here (the public view filters them out).
 */
export function checkRows(checks: Check[]): CheckRow[] {
  const rows: CheckRow[] = [];
  const id = latest(checks, "id");
  if (id) rows.push({ kind: "id", title: "ID checked", detail: monthYear(id.checked_at) ?? "Checked", ok: true });
  const insurance = latest(checks, "insurance");
  if (insurance) rows.push({ kind: "insurance", title: "Public liability insurance", detail: validity(insurance), ok: true });
  const accreditations = checks.filter((c) => c.kind in ACCREDITATION_TITLES);
  for (const c of accreditations) {
    rows.push({ kind: c.kind, title: ACCREDITATION_TITLES[c.kind], detail: validity(c), ok: true });
  }
  if (accreditations.length === 0) {
    rows.push({ kind: "accreditations", title: "Trade accreditations", detail: "None provided", ok: false });
  }
  return rows;
}
