import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AlertIcon, ClockIcon } from "@/components/auth/icons";
import { CanHelpForm, RecommendForm, type PickProvider } from "@/components/ask/AnswerForm";
import { Button } from "@/components/ui/Button";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import { askedOn, isQuestionOpen, QUESTION_ERRORS, QUESTION_FALLBACK_ERROR } from "@/lib/questions";
import { ID_PATTERN } from "@/lib/review-form";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Recommend someone | Bolton Vouched",
  description: "Point a neighbour to someone listed on Bolton Vouched.",
  robots: { index: false },
};

type Row = { id: string; slug: string; business_name: string; areas?: string[]; own?: boolean };
type Context = {
  question: {
    id: string;
    category_slug: string;
    category_name: string;
    district: string;
    body: string;
    asker_name: string;
    created_at: string;
    own: boolean;
  };
  answered: boolean;
  blocked: string | null;
  my_providers: Row[];
  providers: Row[];
};

const toPick = (r: Row): PickProvider => ({ id: r.id, slug: r.slug, businessName: r.business_name, areas: r.areas ?? [] });

export default async function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireMember(ID_PATTERN.test(id) ? platformPath("ask", id, "answer") : platformPath("ask"));
  if (!ID_PATTERN.test(id)) notFound();
  // Service role, with the user id from the verified session (question_answer_context is server-only).
  const { data, error } = await createServiceClient().rpc("question_answer_context", { p_uid: user.id, p_question: id });
  if (error) throw new Error(`question_answer_context failed: ${error.message}`);
  const ctx = data as Context | null;
  if (!ctx) notFound();

  const q = ctx.question;
  const back = platformPath("ask", q.id);
  const others = ctx.providers.filter((p) => !p.own).map(toPick);
  const ownInTrade = ctx.providers.some((p) => p.own);
  // Why they can't answer, if they can't: their own question, already answered, closed, or the account.
  const stop = q.own
    ? QUESTION_ERRORS.own_question
    : ctx.answered
      ? QUESTION_ERRORS.already_answered
      : !isQuestionOpen(q.created_at)
        ? QUESTION_ERRORS.question_closed
        : ctx.blocked
          ? ((QUESTION_ERRORS as Record<string, string>)[ctx.blocked] ?? QUESTION_FALLBACK_ERROR)
          : null;

  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: "Ask Bolton", path: platformPath("ask") },
          { name: `${q.category_name} in ${q.district}`, path: back },
          { name: "Answer", path: platformPath("ask", q.id, "answer") },
        ]}
      />
      <section className="auth-card" aria-labelledby="answer-title">
        <div>
          <p className="eyebrow">
            {q.category_name} · {q.district}
          </p>
          <h1 id="answer-title" className="q-quote">
            {q.body}
          </h1>
          <p className="lede">
            Asked by {q.asker_name} on {askedOn(q.created_at)}
          </p>
        </div>
        {stop && (
          <>
            <p role="status" className="form-note">
              <ClockIcon />
              {stop}
            </p>
            <Button href={back} variant="secondary">
              Back to the question
            </Button>
          </>
        )}
      </section>

      {!stop && ctx.my_providers.length > 0 && (
        <section className="auth-card" aria-labelledby="help-title">
          <div>
            <h2 id="help-title">Is this a job for you?</h2>
            <p className="lede">
              You can&apos;t recommend your own business, but you can say you can help. It&apos;s shown as you speaking
              for yourself, apart from residents&apos; recommendations.
            </p>
          </div>
          <CanHelpForm questionId={q.id} mine={ctx.my_providers.map(toPick)} />
        </section>
      )}

      {!stop && (
        <section className="auth-card" aria-labelledby="rec-title">
          <div>
            <h2 id="rec-title">Recommend someone</h2>
            <p className="lede">
              Pick someone listed for {q.category_name.toLowerCase()} you&apos;ve used and would use again.
              {ownInTrade ? " Your own listing isn't in the list." : ""}
            </p>
          </div>
          {others.length > 0 ? (
            <RecommendForm questionId={q.id} providers={others} tradeName={q.category_name} />
          ) : (
            <p role="status" className="form-alert">
              <AlertIcon />
              {ownInTrade ? "Nobody else" : "Nobody"} is listed for {q.category_name.toLowerCase()} yet, so there&apos;s no one to recommend.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
