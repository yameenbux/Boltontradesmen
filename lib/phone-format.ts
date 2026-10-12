// "+447700900401" → "07700 900401", the way people write their own number.
export function nationalMobile(e164: string): string {
  const m = /^\+44(7\d{3})(\d{6})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]}` : e164;
}
