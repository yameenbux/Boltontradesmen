export type Check = { kind: string; expires_on?: string | null; checked_at?: string | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ACCREDITATION_NAMES: Record<string, string> = {
  gas_safe: "Gas Safe",
  dvsa_adi: "DVSA ADI",
  food_hygiene: "Food hygiene",
  pipa: "PIPA",
  niceic_napit: "NICEIC/NAPIT",
  dbs: "DBS",
  other: "Other",
};

function monthYear(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

export function checksSummaryText(checks: Check[]): string {
  if (checks.length === 0) return "No checks yet";
  const parts: string[] = [];
  const id = checks.find((c) => c.kind === "id");
  if (id) {
    const when = monthYear(id.checked_at);
    parts.push(when ? `✓ ID checked ${when}` : "✓ ID checked");
  }
  const insurance = checks.find((c) => c.kind === "insurance");
  if (insurance) {
    const until = monthYear(insurance.expires_on);
    parts.push(until ? `✓ Insured to ${until}` : "✓ Insured");
  }
  const accreditations = checks
    .filter((c) => c.kind in ACCREDITATION_NAMES)
    .map((c) => ACCREDITATION_NAMES[c.kind]);
  parts.push(
    accreditations.length > 0
      ? `Accreditations: ${accreditations.join(", ")}`
      : "Accreditations: none provided",
  );
  return parts.join(" · ");
}
