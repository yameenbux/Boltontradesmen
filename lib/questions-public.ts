import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import type { PublicAnswer, PublicQuestion } from "@/lib/questions";
import type { SitemapQuestion } from "@/lib/seo";

// Public community questions, read through question_public and question_answer_public with the cookie-free client,
// so the Ask pages stay static (ISR). Only published questions and answers of live providers are in the views.

/* eslint-disable @typescript-eslint/no-explicit-any */
function toQuestion(r: any): PublicQuestion {
  return {
    id: r.id,
    categorySlug: r.category_slug,
    categoryName: r.category_name,
    district: r.district,
    body: r.body,
    askerName: r.asker_name,
    createdAt: r.created_at,
    recommendationCount: r.recommendation_count ?? 0,
    canHelpCount: r.can_help_count ?? 0,
  };
}

function toAnswer(r: any): PublicAnswer {
  return {
    id: r.id,
    questionId: r.question_id,
    kind: r.kind === "can_help" ? "can_help" : "recommend",
    providerId: r.provider_id,
    providerSlug: r.provider_slug,
    businessName: r.business_name,
    hasWhatsapp: !!r.has_whatsapp,
    authorName: r.author_name ?? null,
    note: r.note ?? null,
    createdAt: r.created_at,
  };
}

/** The most recent questions, newest first. */
export async function listRecentQuestions(limit = 100): Promise<PublicQuestion[]> {
  const { data, error } = await createPublicClient()
    .from("question_public")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id")
    .limit(limit);
  if (error) throw new Error(`listRecentQuestions: ${error.message}`);
  return (data ?? []).map(toQuestion);
}

export const getPublicQuestion = cache(async (id: string): Promise<PublicQuestion | null> => {
  const { data, error } = await createPublicClient().from("question_public").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getPublicQuestion: ${error.message}`);
  return data ? toQuestion(data) : null;
});

export const listQuestionAnswers = cache(async (questionId: string): Promise<PublicAnswer[]> => {
  const { data, error } = await createPublicClient()
    .from("question_answer_public")
    .select("*")
    .eq("question_id", questionId)
    .order("created_at")
    .limit(500);
  if (error) throw new Error(`listQuestionAnswers: ${error.message}`);
  return (data ?? []).map(toAnswer);
});

/** One public answer (for the Report page); null when it isn't public. */
export async function getPublicAnswer(id: string): Promise<PublicAnswer | null> {
  const { data, error } = await createPublicClient()
    .from("question_answer_public")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getPublicAnswer: ${error.message}`);
  return data ? toAnswer(data) : null;
}

/** Questions with at least one recommendation, for the sitemap (lib/seo.ts picks the open or recent ones). */
export async function listAnsweredQuestions(): Promise<SitemapQuestion[]> {
  const { data, error } = await createPublicClient()
    .from("question_public")
    .select("id, created_at, closes_at, recommendation_count")
    .gt("recommendation_count", 0)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`listAnsweredQuestions: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    closesAt: r.closes_at,
    recommendationCount: r.recommendation_count ?? 0,
  }));
}
