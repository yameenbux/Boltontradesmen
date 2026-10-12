"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireMember } from "@/lib/auth";
import { deviceHash } from "@/lib/device-hash";
import { platformPath } from "@/lib/paths";
import {
  ERROR_FIELD,
  ID_PATTERN,
  REVIEW_ERRORS,
  reviewErrorMessage,
  reviewInputSchema,
  type ReviewErrorCode,
  type ReviewStatus,
} from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";

export type ReviewFormState = {
  ok?: boolean;
  status?: ReviewStatus;
  reviewId?: string;
  error?: string;
  errors?: Record<string, string>;
  proofError?: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function field(fd: FormData, name: string): string | undefined {
  const v = fd.get(name);
  return typeof v === "string" ? v : undefined;
}

async function device(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  return deviceHash(ip, h.get("user-agent") ?? "");
}

type Prepared =
  | {
      kind: "ready";
      slug: string;
      supabase: Awaited<ReturnType<typeof requireMember>>["supabase"];
      p: Record<string, unknown>;
    }
  | { kind: "done"; state: ReviewFormState };

/** Signs-in check, then the answers checked the same way the database will check them. */
async function prepare(fd: FormData): Promise<Prepared> {
  const rawSlug = field(fd, "slug") ?? "";
  const slug = SLUG.test(rawSlug) ? rawSlug : "";
  const { supabase } = await requireMember(slug ? platformPath("p", slug, "review") : platformPath("account"));
  const providerId = field(fd, "provider_id") ?? "";
  if (!slug || !ID_PATTERN.test(providerId))
    return { kind: "done", state: { error: reviewErrorMessage({ message: "" }) } };

  const parsed = reviewInputSchema.safeParse({
    category_id: field(fd, "category_id"),
    job_month: field(fd, "job_month"),
    value_band: field(fd, "value_band") || undefined,
    on_time: field(fd, "on_time") || undefined,
    on_price: field(fd, "on_price") || undefined,
    quality: field(fd, "quality") || undefined,
    tidy: field(fd, "tidy") ?? "",
    use_again: field(fd, "use_again") || undefined,
    comment: field(fd, "comment"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { kind: "done", state: { errors } };
  }
  return { kind: "ready", slug, supabase, p: { provider_id: providerId, ...parsed.data } };
}

function failed(error: { message: string }, where: string): ReviewFormState {
  if (!(error.message in REVIEW_ERRORS)) console.error(`review: ${where} failed:`, error.message);
  const message = reviewErrorMessage(error);
  const key = ERROR_FIELD[error.message as ReviewErrorCode];
  return key ? { errors: { [key]: message } } : { error: message };
}

function posted(slug: string, data: unknown): ReviewFormState {
  const row = (data ?? {}) as { id?: string; status?: string };
  revalidatePublicPages(slug);
  revalidatePath(platformPath("account"));
  return { ok: true, status: row.status === "under_check" ? "under_check" : "published", reviewId: row.id };
}

/** A new review: posted at once by submit_review, which applies every posting rule and the automatic checks. */
export async function submitReview(_prev: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const prep = await prepare(fd);
  if (prep.kind === "done") return prep.state;
  const { data, error } = await prep.supabase.rpc("submit_review", { p: prep.p, p_device_hash: await device() });
  if (error) return failed(error, "submit_review");
  return posted(prep.slug, data);
}

/** Changes to the person's own review within 14 days; the checks run again. */
export async function editReview(_prev: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const reviewId = field(fd, "review_id") ?? "";
  const prep = await prepare(fd);
  if (prep.kind === "done") return prep.state;
  if (!ID_PATTERN.test(reviewId)) return { error: reviewErrorMessage({ message: "" }) };
  const { provider_id: _ignored, ...p } = prep.p; // eslint-disable-line @typescript-eslint/no-unused-vars
  const { data, error } = await prep.supabase.rpc("edit_review", { p_id: reviewId, p, p_device_hash: await device() });
  if (error) return failed(error, "edit_review");
  return posted(prep.slug, data);
}
