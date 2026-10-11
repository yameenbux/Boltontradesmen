import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="lost">
      <p className="eyebrow m-0">Error 404</p>
      <h1 className="display">We can&rsquo;t find that page</h1>
      <p>It may have moved, or the link might be mistyped. Everyone we list is a tap away from the home page.</p>
      <Button href="/" variant="primary">
        Back to the home page
      </Button>
    </main>
  );
}
