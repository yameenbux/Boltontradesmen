import { describe, expect, it } from "vitest";
import {
  ANSWER_NOTE_MAX,
  askedOn,
  bodyProblem,
  closesAt,
  groupRecommendations,
  isQuestionOpen,
  listNames,
  noteProblem,
  QUESTION_ERRORS,
  QUESTION_MAX,
  recommendationCount,
  recommendedBy,
  tidyText,
  type PublicAnswer,
} from "@/lib/questions";

describe("content rules (the same as the database's)", () => {
  it("tidies spaces and line breaks", () => {
    expect(tidyText("  Anyone know\n\na good   sparky?  ")).toBe("Anyone know a good sparky?");
    expect(tidyText(null)).toBe("");
  });

  it("needs 10 to 280 characters", () => {
    expect(bodyProblem("Too short")).toBe("body_too_short");
    expect(bodyProblem("    a        b      ")).toBe("body_too_short");
    expect(bodyProblem("Anyone know a good electrician in BL3?")).toBeNull();
    expect(bodyProblem("a".repeat(QUESTION_MAX))).toBeNull();
    expect(bodyProblem("a".repeat(QUESTION_MAX + 1))).toBe("body_too_long");
  });

  it("refuses phone numbers however they're spaced", () => {
    expect(bodyProblem("Ring me on 07700 900 123 please")).toBe("body_has_phone");
    expect(bodyProblem("Call (01204) 123-456 thanks")).toBe("body_has_phone");
    expect(bodyProblem("Need 2 sockets and 3 lights in BL3")).toBeNull();
  });

  it("refuses web and email addresses", () => {
    expect(bodyProblem("See www.example.com for the job")).toBe("body_has_link");
    expect(bodyProblem("Look at https://example.org first")).toBe("body_has_link");
    expect(bodyProblem("Email me at someone@example.org")).toBe("body_has_link");
    expect(bodyProblem("Found one on example.co.uk already")).toBe("body_has_link");
  });

  it("checks an answer's note the same way, and an empty note is fine", () => {
    expect(noteProblem("")).toBeNull();
    expect(noteProblem("   ")).toBeNull();
    expect(noteProblem("Sorted my fuse box in an afternoon.")).toBeNull();
    expect(noteProblem("x".repeat(ANSWER_NOTE_MAX + 1))).toBe("note_too_long");
    expect(noteProblem("Text him on 07700900123")).toBe("note_has_phone");
    expect(noteProblem("His site is www.sparks.example")).toBe("note_has_link");
  });

  it("has a plain message for every error", () => {
    for (const message of Object.values(QUESTION_ERRORS)) expect(message).toMatch(/^[A-Z].+[.!]$/);
  });
});

describe("open for 14 days, worked out when read", () => {
  const asked = "2026-10-01T09:00:00Z";
  it("closes 14 days after it went public", () => {
    expect(closesAt(asked).toISOString()).toBe("2026-10-15T09:00:00.000Z");
  });
  it("is open until then and closed from then on", () => {
    expect(isQuestionOpen(asked, new Date("2026-10-15T08:59:59Z"))).toBe(true);
    expect(isQuestionOpen(asked, new Date("2026-10-15T09:00:00Z"))).toBe(false);
    expect(isQuestionOpen(asked, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });
  it("treats a bad date as closed", () => {
    expect(isQuestionOpen("not a date")).toBe(false);
  });
});

describe("grouping recommendations", () => {
  const a = (
    id: string,
    provider: string,
    name: string | null,
    at: string,
    extra: Partial<PublicAnswer> = {},
  ): PublicAnswer => ({
    id,
    questionId: "q",
    kind: "recommend",
    providerId: provider,
    providerSlug: `slug-${provider}`,
    businessName: `Biz ${provider}`,
    hasWhatsapp: provider === "p1",
    authorName: name,
    note: null,
    createdAt: at,
    ...extra,
  });

  const answers = [
    a("a1", "p2", "Sarah K.", "2026-10-01T10:00:00Z", { note: "Quick and tidy." }),
    a("a2", "p1", "Tom B.", "2026-10-01T11:00:00Z"),
    a("a3", "p1", "Ali R.", "2026-10-01T12:00:00Z", { note: "Fair price." }),
    a("a4", "p1", "Jo W.", "2026-10-01T09:00:00Z"),
    a("a5", "p3", null, "2026-10-01T08:00:00Z", { kind: "can_help", note: "Free this week." }),
  ];
  const groups = groupRecommendations(answers);

  it("puts the most recommended first, with everyone's names in the order they answered", () => {
    expect(groups.map((g) => [g.businessName, g.count])).toEqual([
      ["Biz p1", 3],
      ["Biz p2", 1],
    ]);
    expect(groups[0].names).toEqual(["Jo W.", "Tom B.", "Ali R."]);
    expect(groups[0].hasWhatsapp).toBe(true);
    expect(groups[0].answerIds.map((x) => x.id)).toEqual(["a4", "a2", "a3"]);
  });

  it("keeps each note with who wrote it", () => {
    expect(groups[0].notes).toEqual([{ id: "a3", name: "Ali R.", note: "Fair price." }]);
    expect(groups[1].notes).toEqual([{ id: "a1", name: "Sarah K.", note: "Quick and tidy." }]);
  });

  it("leaves \"I can help\" out (the trader speaking for themselves is shown apart)", () => {
    expect(groups.some((g) => g.providerId === "p3")).toBe(false);
  });

  it("breaks a tie by whoever was recommended first", () => {
    const tie = groupRecommendations([
      a("b1", "late", "A A.", "2026-10-02T00:00:00Z"),
      a("b2", "early", "B B.", "2026-10-01T00:00:00Z"),
    ]);
    expect(tie.map((g) => g.providerId)).toEqual(["early", "late"]);
  });

  it("reads naturally", () => {
    expect(recommendedBy(1)).toBe("Recommended by 1 person");
    expect(recommendedBy(3)).toBe("Recommended by 3 people");
    expect(listNames(["Sarah K."])).toBe("Sarah K.");
    expect(listNames(["Sarah K.", "Tom B."])).toBe("Sarah K. and Tom B.");
    expect(listNames(["Sarah K.", "Tom B.", "Ali R."])).toBe("Sarah K., Tom B. and Ali R.");
    expect(recommendationCount(0)).toBe("No recommendations yet");
    expect(recommendationCount(1)).toBe("1 recommendation");
    expect(recommendationCount(4)).toBe("4 recommendations");
  });
});

describe("askedOn", () => {
  it("is a fixed date in Bolton's time, never 'today'", () => {
    expect(askedOn("2026-10-12T23:30:00Z")).toBe("13 Oct");
    expect(askedOn("nonsense")).toBe("");
  });
});
