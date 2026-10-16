import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { getUser: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
// Asking, answering and reporting go through the service role, with the user id from the verified session.
const serviceRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: serviceRpc }) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { askQuestion } from "@/app/platform/ask/new/actions";
import { answerQuestion } from "@/app/platform/ask/[id]/answer/actions";
import { reportQuestionContent } from "@/app/platform/ask/[id]/report/actions";

const ACCOUNT = {
  user_id: "u1",
  display_name: "Sarah K.",
  postcode_district: "BL3",
  role: "resident",
  deleted: false,
  created_at: "2026-10-12T09:00:00Z",
  providers: [],
};
const CAT = "11111111-1111-4111-8111-111111111111";
const Q = "44444444-4444-4444-8444-444444444444";
const PROVIDER = "22222222-2222-4222-8222-222222222222";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

function signedIn(result: { data?: unknown; error?: unknown }) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockImplementation(async (name: string) =>
    name === "my_account" ? { data: ACCOUNT, error: null } : { data: null, error: { message: "unexpected" } },
  );
  serviceRpc.mockImplementation(async () => ({ data: result.data ?? null, error: result.error ?? null }));
}

beforeEach(() => {
  auth.getUser.mockReset();
  rpc.mockReset();
  serviceRpc.mockReset();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const question = { category_id: CAT, district: "BL3", body: "  Anyone know a good\nelectrician in BL3?  " };

describe("askQuestion", () => {
  it("sends anyone signed out to sign in, and back to the form", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(askQuestion({}, form(question))).rejects.toThrow(
      `REDIRECT /platform/sign-in?next=${encodeURIComponent("/platform/ask/new")}`,
    );
  });

  it("posts through submit_question with the session's user id, refreshes the pages and opens the question", async () => {
    signedIn({ data: { id: Q, status: "published" } });
    await expect(askQuestion({}, form(question))).rejects.toThrow(`REDIRECT /platform/ask/${Q}`);
    expect(serviceRpc).toHaveBeenCalledWith("submit_question", {
      p_uid: "u1",
      p_category: CAT,
      p_district: "BL3",
      p_body: "Anyone know a good electrician in BL3?",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/ask");
    expect(revalidatePath).toHaveBeenCalledWith(`/platform/ask/${Q}`);
  });

  it("says a held question is waiting for a check, without refreshing anything public", async () => {
    signedIn({ data: { id: Q, status: "pending" } });
    expect(await askQuestion({}, form(question))).toEqual({ ok: true, held: true });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("checks the question before the database does", async () => {
    signedIn({});
    const res = await askQuestion({}, form({ ...question, body: "Call 07700 900 123", district: "OTHER" }));
    expect(res.errors).toMatchObject({
      body: "Please leave phone numbers out. Traders get in touch through the buttons on their page.",
      district: "Choose your area.",
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("puts the database's refusals next to the right field, or above the button", async () => {
    signedIn({ error: { message: "open_question_exists" } });
    expect((await askQuestion({}, form(question))).errors?.category_id).toMatch(/already got an open question/);
    signedIn({ error: { message: "question_limit" } });
    expect((await askQuestion({}, form(question))).message).toBe(
      "You can ask 3 questions a day. Come back tomorrow to ask another.",
    );
  });
});

describe("answerQuestion", () => {
  const rec = { question_id: Q, kind: "recommend", provider_id: PROVIDER, note: " Sorted my  fuse box. " };

  it("recommends through submit_question_answer as the server, then shows the question", async () => {
    signedIn({ data: { id: "a1", question_id: Q } });
    await expect(answerQuestion({}, form(rec))).rejects.toThrow(`REDIRECT /platform/ask/${Q}`);
    expect(serviceRpc).toHaveBeenCalledWith("submit_question_answer", {
      p_uid: "u1",
      p_question: Q,
      p_kind: "recommend",
      p_provider: PROVIDER,
      p_note: "Sorted my fuse box.",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/platform/ask/${Q}`);
  });

  it("passes \"I can help\" through as its own kind, with no note", async () => {
    signedIn({ data: { id: "a2", question_id: Q } });
    await expect(answerQuestion({}, form({ ...rec, kind: "can_help", note: "" }))).rejects.toThrow("REDIRECT");
    expect(serviceRpc).toHaveBeenCalledWith("submit_question_answer", expect.objectContaining({ p_kind: "can_help", p_note: null }));
  });

  it("explains a trader recommending themselves, next to the choice", async () => {
    signedIn({ error: { message: "own_listing" } });
    expect((await answerQuestion({}, form(rec))).errors?.provider_id).toBe(
      "You can't recommend your own business. Tap “I can help” instead.",
    );
  });

  it("needs someone chosen, and a note without a web address", async () => {
    signedIn({});
    const res = await answerQuestion({}, form({ ...rec, provider_id: "", note: "see www.example.com" }));
    expect(res.errors).toEqual({ provider_id: "Choose who you recommend.", note: "Please leave out web and email addresses." });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("reportQuestionContent", () => {
  it("reports an answer through the server", async () => {
    signedIn({ data: Q });
    const res = await reportQuestionContent({}, form({ question_id: Q, answer_id: PROVIDER, note: "An advert" }));
    expect(res.ok).toBe(true);
    expect(serviceRpc).toHaveBeenCalledWith("report_question_content", {
      p_uid: "u1",
      p_target_type: "answer",
      p_target_id: PROVIDER,
      p_note: "An advert",
    });
  });

  it("reports the question itself when no answer is named, and says when it's already reported", async () => {
    signedIn({ error: { message: "already_reported" } });
    const res = await reportQuestionContent({}, form({ question_id: Q, note: "Rude" }));
    expect(res.message).toBe("You've already reported this. We'll look at it.");
    expect(serviceRpc).toHaveBeenCalledWith("report_question_content", expect.objectContaining({ p_target_type: "question", p_target_id: Q }));
  });
});
