export const CHECK_KINDS = [
  ["id", "ID seen"],
  ["insurance", "Insurance"],
  ["gas_safe", "Gas Safe"],
  ["dvsa_adi", "DVSA ADI"],
  ["food_hygiene", "Food hygiene"],
  ["pipa", "PIPA"],
  ["niceic_napit", "NICEIC/NAPIT"],
  ["dbs", "DBS"],
  ["other", "Other"],
] as const;

export const STATUSES = ["invited", "consented", "live", "paused", "removed"] as const;

export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  ok?: boolean;
  values?: Record<string, string | string[]>; // submitted values, so a failed submit keeps the form filled
};
