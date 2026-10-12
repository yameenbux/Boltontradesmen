export const BL_DISTRICTS: readonly string[] = [
  "BL1", "BL2", "BL3", "BL4", "BL5", "BL6", "BL7", "M26", "M28", "M46", "WN2",
];

// Areas offered when someone sets up their account: the districts above, or "OTHER" (never shown publicly).
export const OTHER_DISTRICT = "OTHER";

export function isDistrictChoice(v: string): boolean {
  return v === OTHER_DISTRICT || BL_DISTRICTS.includes(v);
}
