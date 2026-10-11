import Link from "next/link";
import { Brand } from "@/components/site/Brand";
import { PLATFORM, SECTIONS } from "@/components/site/content";
import { Icon } from "@/components/site/icons";

// Sticky top bar. Wide screens show the section links inline; phones get a <details> menu (works without JavaScript).
export function SiteNav() {
  const links = (
    <>
      {SECTIONS.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`}>{s.label}</a>
        </li>
      ))}
      <li>
        <Link href="/privacy">Privacy</Link>
      </li>
    </>
  );
  return (
    <header className="s-nav">
      <div className="s-wrap s-nav-in">
        <Brand />
        <nav aria-label="Sections" className="s-nav-end">
          <ul className="s-links">{links}</ul>
          <details className="s-menu">
            <summary aria-label="Menu">
              <Icon name="menu" />
            </summary>
            <ul>{links}</ul>
          </details>
          <Link href={PLATFORM} className="s-btn s-btn-primary s-btn-sm">
            <span>
              Open<span className="s-long"> the platform</span>
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
