import { BL_DISTRICTS } from "@/lib/districts";
import { LINK_IN_TEXT } from "@/lib/listing-edit";
import { PHONE_IN_TEXT } from "@/lib/review-form";

// Community questions ("Anyone know a good electrician in BL3?"): the rules, messages and the shaping of answers.
// Client-safe: the forms, their server actions and the public pages share it. The database (submit_question,
// submit_question_answer, migration 000031) applies the same rules again and is the authority.
// Recommendations are not reviews: nothing here feeds ranking, scores or badges.

export const QUESTION_MIN = 10;
export const QUESTION_MAX = 280;
export const ANSWER_NOTE_MAX = 200;
/** A question takes answers for this many days after it goes public, then shows as closed. */
export const QUESTION_OPEN_DAYS = 14;
export const QUESTIONS_PER_DAY = 3;

/** Spaces and line breaks squashed to single spaces, trimmed (the database's private.community_tidy). */
export function tidyText(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export type QuestionErrorCode =
  | "not_member"
  | "blocked"
  | "bad_category"
  | "bad_district"
  | "body_too_short"
  | "body_too_long"
  | "body_has_phone"
  | "body_has_link"
  | "question_limit"
  | "open_question_exists"
  | "question_not_found"
  | "question_closed"
  | "own_question"
  | "already_answered"
  | "bad_input"
  | "bad_provider"
  | "own_listing"
  | "not_your_listing"
  | "note_too_long"
  | "note_has_phone"
  | "note_has_link"
  | "answer_limit";

export const QUESTION_ERRORS: Record<QuestionErrorCode, string> = {
  not_member: "Please sign in again.",
  blocked: "Your account can't post here. Contact us if you think that's wrong.",
  bad_category: "Choose the trade you need.",
  bad_district: "Choose your area.",
  body_too_short: `Say a bit more: at least ${QUESTION_MIN} characters.`,
  body_too_long: `Keep your question to ${QUESTION_MAX} characters.`,
  body_has_phone: "Please leave phone numbers out. Traders get in touch through the buttons on their page.",
  body_has_link: "Please leave out web and email addresses.",
  question_limit: `You can ask ${QUESTIONS_PER_DAY} questions a day. Come back tomorrow to ask another.`,
  open_question_exists:
    "You've already got an open question for this trade. It stays open for 14 days; keep an eye on it there.",
  question_not_found: "That question isn't on the site any more.",
  question_closed: "This question has closed, so it can't take new answers. Ask again if you still need someone.",
  own_question: "You can't answer your own question.",
  already_answered: "You've already answered this question.",
  bad_input: "Something went wrong. Please try again.",
  bad_provider: "Choose someone listed for this trade.",
  own_listing: "You can't recommend your own business. Tap “I can help” instead.",
  not_your_listing: "You can only say “I can help” for your own listing.",
  note_too_long: `Keep your note to ${ANSWER_NOTE_MAX} characters.`,
  note_has_phone: "Please leave phone numbers out. People call with the button on the trader's page.",
  note_has_link: "Please leave out web and email addresses.",
  answer_limit: "You've answered a lot of questions today. Please come back tomorrow.",
};
export const QUESTION_FALLBACK_ERROR = "Something went wrong. Please try again.";

export function questionErrorMessage(err: { message: string }): string {
  return (QUESTION_ERRORS as Record<string, string>)[err.message] ?? QUESTION_FALLBACK_ERROR;
}

/** Which form field a database error belongs next to (others are shown above the button). */
export const QUESTION_ERROR_FIELD: Partial<Record<QuestionErrorCode, string>> = {
  bad_category: "category_id",
  bad_district: "district",
  body_too_short: "body",
  body_too_long: "body",
  body_has_phone: "body",
  body_has_link: "body",
  open_question_exists: "category_id",
  bad_provider: "provider_id",
  own_listing: "provider_id",
  note_too_long: "note",
  note_has_phone: "note",
  note_has_link: "note",
};

/** The question text checked as the database will check it: an error code, or null when it's fine. */
export function bodyProblem(raw: string): QuestionErrorCode | null {
  const body = tidyText(raw);
  if ([...body].length < QUESTION_MIN) return "body_too_short";
  if ([...body].length > QUESTION_MAX) return "body_too_long";
  if (PHONE_IN_TEXT.test(body)) return "body_has_phone";
  if (LINK_IN_TEXT.test(body)) return "body_has_link";
  return null;
}

/** An answer's optional note: an error code, or null when it's fine (an empty note is fine). */
export function noteProblem(raw: string): QuestionErrorCode | null {
  const note = tidyText(raw);
  if ([...note].length > ANSWER_NOTE_MAX) return "note_too_long";
  if (PHONE_IN_TEXT.test(note)) return "note_has_phone";
  if (LINK_IN_TEXT.test(note)) return "note_has_link";
  return null;
}

export function isDistrict(v: string): boolean {
  return BL_DISTRICTS.includes(v);
}

// ---------------------------------------------------------------- open and closed
/** When a question stops taking answers: QUESTION_OPEN_DAYS after it went public. */
export function closesAt(publishedAt: string): Date {
  return new Date(new Date(publishedAt).getTime() + QUESTION_OPEN_DAYS * 24 * 60 * 60 * 1000);
}

/** Worked out when it's read (nothing closes a question in the database). */
export function isQuestionOpen(publishedAt: string, now: Date = new Date()): boolean {
  const t = closesAt(publishedAt).getTime();
  return Number.isFinite(t) && now.getTime() < t;
}

// ---------------------------------------------------------------- shapes
export type PublicQuestion = {
  id: string;
  categorySlug: string;
  categoryName: string;
  district: string;
  body: string;
  askerName: string;
  /** When it went public. */
  createdAt: string;
  recommendationCount: number;
  canHelpCount: number;
};

export type PublicAnswer = {
  id: string;
  questionId: string;
  kind: "recommend" | "can_help";
  providerId: string;
  providerSlug: string;
  businessName: string;
  hasWhatsapp: boolean;
  /** The resident's shown name ("Sarah K."); null for "I can help", where the trader speaks for themselves. */
  authorName: string | null;
  note: string | null;
  createdAt: string;
};

export type RecommendationGroup = {
  providerId: string;
  providerSlug: string;
  businessName: string;
  hasWhatsapp: boolean;
  count: number;
  /** Shown names, earliest recommendation first. */
  names: string[];
  notes: { id: string; name: string; note: string }[];
  /** Answer ids in the group (each can be reported). */
  answerIds: { id: string; name: string }[];
};

/**
 * Residents' recommendations grouped by provider: most recommended first, then whoever was recommended first.
 * "I can help" answers are left out (they're shown apart, as the trader speaking for themselves).
 */
export function groupRecommendations(answers: PublicAnswer[]): RecommendationGroup[] {
  const sorted = [...answers]
    .filter((a) => a.kind === "recommend")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const groups = new Map<string, RecommendationGroup & { first: string }>();
  for (const a of sorted) {
    const name = a.authorName ?? "Bolton resident";
    let g = groups.get(a.providerId);
    if (!g) {
      g = {
        providerId: a.providerId,
        providerSlug: a.providerSlug,
        businessName: a.businessName,
        hasWhatsapp: a.hasWhatsapp,
        count: 0,
        names: [],
        notes: [],
        answerIds: [],
        first: a.createdAt,
      };
      groups.set(a.providerId, g);
    }
    g.count += 1;
    g.names.push(name);
    g.answerIds.push({ id: a.id, name });
    if (a.note) g.notes.push({ id: a.id, name, note: a.note });
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.first.localeCompare(b.first))
    .map(({ first: _first, ...g }) => g); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** "Sarah K.", "Sarah K. and Tom B.", "Sarah K., Tom B. and Ali R." */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Recommended by 1 person", "Recommended by 3 people". */
export function recommendedBy(count: number): string {
  return `Recommended by ${count} ${count === 1 ? "person" : "people"}`;
}

/** "No recommendations yet", "1 recommendation", "4 recommendations". */
export function recommendationCount(count: number): string {
  if (count === 0) return "No recommendations yet";
  return `${count} recommendation${count === 1 ? "" : "s"}`;
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** "12 Oct": a fixed date, so a cached page never says "today" the next day. */
export function askedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? DAY_MONTH.format(d) : "";
}
