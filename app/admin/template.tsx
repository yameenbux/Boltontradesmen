// Remounts on navigation between top-level routes, replaying the enter animation (off under reduced motion).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
