// "Good morning, Yameen" on the home page for signed-in people (UK time; morning until 12, afternoon until 6pm).

export function timeOfDay(now: Date, timeZone = "Europe/London"): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** "Yameen" from the shown name "Yameen B."; null when there's nothing usable. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "");
  return first ? first : null;
}

export function greeting(firstName: string, now: Date = new Date()): string {
  return `Good ${timeOfDay(now)}, ${firstName}`;
}
