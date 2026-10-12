// Plain-English names for the automatic checks and reports, for the admin's queues. Client-safe.

export const RULE_TEXT: Record<string, string> = {
  burst_48h: "3 or more reviews of this provider within 48 hours",
  accounts_created_together: "3 or more reviewers whose accounts were made within 10 minutes of each other",
  shared_device: "Another reviewer of this provider posted from the same device",
  lone_extreme_new_account: "Brand-new account, first review, 1 or 5 stars",
  user_report: "Reported by a resident",
};

export function ruleText(rule: string): string {
  return RULE_TEXT[rule] ?? rule;
}

/** "made 2 hours ago", "made 3 days ago" for an account's creation time (null for fixture accounts). */
export function accountAge(createdAt: string | null, now: Date = new Date()): string {
  if (!createdAt) return "account age unknown";
  const mins = Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 60000));
  if (mins < 60) return `account made ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `account made ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `account made ${days} days ago`;
}
