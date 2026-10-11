import { PlatformChrome } from "@/components/PlatformChrome";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";

// Rendered inside the bare root layout (no segment layout above it), so it brings the chrome itself.
export default function NotFound() {
  return (
    <PlatformChrome>
      <div className="page-enter">
        <main className="lost">
          <p className="eyebrow m-0">Error 404</p>
          <h1 className="display">We can&rsquo;t find that page</h1>
          <p>It may have moved, or the link might be mistyped. Everyone we list is a tap away from the home page.</p>
          <Button href={platformPath()} variant="primary">
            Back to the home page
          </Button>
        </main>
      </div>
    </PlatformChrome>
  );
}
