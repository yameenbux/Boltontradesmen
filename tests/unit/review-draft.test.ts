import { describe, it, expect } from "vitest";
import { clearDraft, draftKey, loadDraft, saveDraft } from "@/lib/review-draft";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

const broken: Storage = {
  length: 0,
  clear: () => {
    throw new Error("denied");
  },
  getItem: () => {
    throw new Error("denied");
  },
  key: () => null,
  removeItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("review drafts", () => {
  it("keys drafts by provider", () => {
    expect(draftKey("ace")).toBe("bv-review-draft:ace");
  });

  it("round-trips a draft and clears it", () => {
    const s = new MemoryStorage();
    saveDraft(s, "ace", { comment: "Lovely job", quality: "4" });
    expect(loadDraft(s, "ace")).toEqual({ comment: "Lovely job", quality: "4" });
    expect(loadDraft(s, "other")).toBeNull();
    clearDraft(s, "ace");
    expect(loadDraft(s, "ace")).toBeNull();
    expect(s.getItem("bv-review-draft:ace")).toBeNull();
  });

  it("ignores junk in storage and keeps only string values", () => {
    const s = new MemoryStorage();
    s.setItem(draftKey("ace"), "{not json");
    expect(loadDraft(s, "ace")).toBeNull();
    s.setItem(draftKey("ace"), JSON.stringify({ comment: "ok", quality: 4, nested: { a: 1 } }));
    expect(loadDraft(s, "ace")).toEqual({ comment: "ok" });
    s.setItem(draftKey("ace"), JSON.stringify(["a"]));
    expect(loadDraft(s, "ace")).toBeNull();
  });

  it("never throws when storage is missing or refuses", () => {
    expect(() => saveDraft(broken, "ace", { comment: "x" })).not.toThrow();
    expect(loadDraft(broken, "ace")).toBeNull();
    expect(() => clearDraft(broken, "ace")).not.toThrow();
    expect(() => saveDraft(undefined, "ace", { comment: "x" })).not.toThrow();
    expect(loadDraft(undefined, "ace")).toBeNull();
  });
});
