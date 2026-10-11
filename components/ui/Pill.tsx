// Small rounded label, e.g. "Verified" (sage) or "Under 3 reviews" (gold); outline/muted are for admin statuses.
export function Pill({
  tone = "sage",
  className,
  children,
}: {
  tone?: "sage" | "gold" | "outline" | "muted";
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={["pill", `pill-${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}
