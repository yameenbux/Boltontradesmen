// Small rounded label, e.g. "Verified" (sage) or "Under 3 reviews" (gold).
export function Pill({
  tone = "sage",
  className,
  children,
}: {
  tone?: "sage" | "gold";
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={["pill", `pill-${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}
