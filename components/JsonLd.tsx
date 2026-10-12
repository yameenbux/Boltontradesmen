import { serializeJsonLd } from "@/lib/seo";

// Structured data for search engines. serializeJsonLd escapes <, > and & so text from the database can't end the tag.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
