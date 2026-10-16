import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AskForm } from "@/components/ask/AskForm";
import { requireMember } from "@/lib/auth";
import { listCategoryGroups } from "@/lib/directory";
import { isDistrict } from "@/lib/questions";
import { platformPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ask a question | Bolton Vouched",
  description: "Ask Bolton residents who they'd recommend, and they'll point you to someone listed here.",
  robots: { index: false },
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function AskNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ?category=<slug>: from a category page's "Can't decide? Ask Bolton". Kept through sign-in.
  const raw = (await searchParams).category;
  const slug = typeof raw === "string" && SLUG.test(raw) ? raw : "";
  const here = slug ? `${platformPath("ask", "new")}?category=${slug}` : platformPath("ask", "new");
  const { account } = await requireMember(here);
  const groups = await listCategoryGroups();
  const defaultCategory = groups.flatMap((g) => g.categories).find((c) => c.slug === slug)?.id ?? "";

  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: "Ask Bolton", path: platformPath("ask") },
          { name: "Ask a question", path: platformPath("ask", "new") },
        ]}
      />
      <section className="auth-card" aria-labelledby="ask-title">
        <div>
          <p className="eyebrow">Ask Bolton</p>
          <h1 id="ask-title">Who do the neighbours recommend?</h1>
          <p className="lede">
            Ask once and locals will point you to people listed here. You&apos;ll show as{" "}
            <b>{account.displayName}</b>.
          </p>
        </div>
        <AskForm
          groups={groups.map(({ group, categories }) => ({
            name: group.name,
            categories: categories.map((c) => ({ id: c.id, name: c.name })),
          }))}
          defaultCategory={defaultCategory}
          defaultDistrict={account.district && isDistrict(account.district) ? account.district : ""}
          held={account.signInKind === "email"}
        />
      </section>
    </main>
  );
}
