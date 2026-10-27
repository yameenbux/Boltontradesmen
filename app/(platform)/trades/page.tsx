import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CategoryGroups } from "@/components/home/CategoryGroups";
import { listCategoryGroups } from "@/lib/directory";
import { platformPath } from "@/lib/paths";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

// Categories plus live-provider counts; cached and refreshed every 5 minutes, no cookies.
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "All trades in Bolton | Bolton Vouched",
  description:
    "Every trade and service on Bolton Vouched, from plumbers and electricians to wedding caterers and driving instructors, with how many local pros are listed in each.",
  path: "/trades",
});

export default async function Trades() {
  const groups = await listCategoryGroups();
  const total = groups.reduce((n, g) => n + g.categories.length, 0);
  const trail = [
    { name: "Home", path: platformPath() },
    { name: "All trades", path: platformPath("trades") },
  ];
  return (
    <main className="trades-page">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Breadcrumbs trail={trail} />
      <h1 className="page-title">All trades</h1>
      <p className="page-sub">{total} trades and services across Bolton. Numbers show how many pros are listed.</p>
      <CategoryGroups groups={groups} />
    </main>
  );
}
