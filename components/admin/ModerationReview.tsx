import { Pill } from "@/components/ui/Pill";
import { accountAge, ruleText } from "@/lib/moderation-text";
import { platformPath } from "@/lib/paths";
import {
  monthYear,
  ON_PRICE_TEXT,
  ON_TIME_TEXT,
  USE_AGAIN_TEXT,
  VALUE_BAND_TEXT,
  type OnPrice,
  type OnTime,
  type UseAgain,
  type ValueBand,
} from "@/lib/review-text";

export type AdminReview = {
  id: string;
  status: string;
  created_at: string;
  job_month: string;
  value_band: ValueBand;
  on_time: OnTime;
  on_price: OnPrice;
  quality: number;
  tidy: boolean | null;
  use_again: UseAgain;
  comment: string | null;
  category_name: string;
  provider_slug: string;
  business_name: string;
  reviewer_name: string;
  account_created_at: string | null;
  reviewer_review_count: number;
};

export type AdminFlag = { id: string; rule: string; source: string; note: string | null };

/** What the admin needs to judge a review: who, how new their account is, the answers, the comment, the flags. */
export function ModerationReview({
  review: r,
  flags,
  ageNow,
}: {
  review: AdminReview;
  flags?: AdminFlag[];
  ageNow: Date;
}) {
  const answers = [
    `Quality ${r.quality}/5`,
    USE_AGAIN_TEXT[r.use_again],
    ON_TIME_TEXT[r.on_time],
    ON_PRICE_TEXT[r.on_price],
    r.tidy === null ? null : r.tidy ? "Left it tidy" : "Didn't leave it tidy",
    VALUE_BAND_TEXT[r.value_band],
  ].filter((a): a is string => a !== null);
  return (
    <div className="mod-review">
      <div className="mod-head">
        <a href={platformPath("p", r.provider_slug)} className="a-link">
          {r.business_name}
        </a>
        {r.status === "under_check" && <Pill tone="gold">Under check</Pill>}
      </div>
      <p className="mod-who">
        <b>{r.reviewer_name}</b> · {accountAge(r.account_created_at, ageNow)} · {r.reviewer_review_count} review
        {r.reviewer_review_count === 1 ? "" : "s"} in all
      </p>
      <p className="mod-meta">
        {r.category_name} · job in {monthYear(r.job_month)}
      </p>
      <ul className="answer-tags" aria-label="Answers">
        {answers.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {r.comment && <p className="mod-comment">{r.comment}</p>}
      {flags && flags.length > 0 && (
        <ul className="mod-flags" aria-label="Why it's here">
          {flags.map((f) => (
            <li key={f.id}>
              <span>{ruleText(f.rule)}</span> <code>{f.rule}</code>
              {f.note && <q>{f.note}</q>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
