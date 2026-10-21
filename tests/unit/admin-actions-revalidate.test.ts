import { describe, it, expect, vi, beforeEach } from "vitest";

// Public pages must drop paused/removed providers (and show edits) as soon as the admin acts.
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const rpc = vi.fn();
vi.mock("@/lib/listing-duplicates", () => ({ listingForPhone: async () => null, duplicateMessage: () => null }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ supabase: { rpc }, user: { id: "u" } }) }));

import { newConsentLink, recordCheck, reinviteProvider, saveProvider, setStatus } from "@/app/admin/(protected)/providers/actions";

const PID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_PATHS = [
  ["/(platform)/p/[slug]", "page"],
  ["/(platform)/c/[category]", "page"],
  ["/"],
  ["/(platform)/prices/[category]", "page"],
  ["/prices"],
];

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  revalidatePath.mockClear();
  rpc.mockReset();
});

describe("admin provider actions revalidate public pages", () => {
  it.each(["paused", "removed", "live"])("setStatus(%s) revalidates provider, category and home pages", async (status) => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await setStatus({}, form({ provider_id: PID, status, reason: "because" }));
    expect(res.ok).toBe(true);
    for (const args of PUBLIC_PATHS) expect(revalidatePath).toHaveBeenCalledWith(...args);
  });

  it("setStatus does not revalidate when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await setStatus({}, form({ provider_id: PID, status: "paused", reason: "" }));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saveProvider revalidates provider, category and home pages", async () => {
    rpc.mockResolvedValue({ data: PID, error: null });
    await expect(
      saveProvider({}, form({ id: PID, business_name: "Ace", contact_name: "", phone: "07700900123", whatsapp: "", areas: "BL1", bio: "" })),
    ).rejects.toThrow(`REDIRECT /admin/providers/${PID}`);
    for (const args of PUBLIC_PATHS) expect(revalidatePath).toHaveBeenCalledWith(...args);
  });
});

describe("recordCheck", () => {
  it("revalidates public pages after a successful check", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await recordCheck({}, form({ provider_id: PID, kind: "id", reference: "ref", expires_on: "" }));
    expect(res.ok).toBe(true);
    for (const args of PUBLIC_PATHS) expect(revalidatePath).toHaveBeenCalledWith(...args);
  });

  it("does not revalidate public pages when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await recordCheck({}, form({ provider_id: PID, kind: "id", reference: "ref", expires_on: "" }));
    expect(revalidatePath).not.toHaveBeenCalledWith("/");
  });
});

describe("newConsentLink", () => {
  it("builds the link under /consent/ on the site URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boltonvouched.example/";
    rpc.mockResolvedValue({ data: "22222222-2222-4222-8222-222222222222", error: null });
    const res = await newConsentLink(PID);
    expect(res.url).toBe("https://boltonvouched.example/consent/22222222-2222-4222-8222-222222222222");
  });
});

describe("reinviteProvider", () => {
  it("needs a reason and calls nothing without one", async () => {
    const res = await reinviteProvider({}, form({ provider_id: PID, reason: "  " }));
    expect(res.errors?.reason).toBe("Enter a reason for re-inviting this provider");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("re-invites with the reason, returns the new link and revalidates public pages", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boltonvouched.example";
    rpc.mockImplementation(async (name: string) =>
      name === "admin_reinvite_provider"
        ? { data: "33333333-3333-4333-8333-333333333333", error: null }
        : { data: { consent_token_expires_at: "2026-10-26T09:00:00Z" }, error: null },
    );
    const res = await reinviteProvider({}, form({ provider_id: PID, reason: "asked to come back" }));
    expect(rpc).toHaveBeenCalledWith("admin_reinvite_provider", { p_id: PID, p_reason: "asked to come back" });
    expect(res.ok).toBe(true);
    expect(res.values?.consent_url).toBe("https://boltonvouched.example/consent/33333333-3333-4333-8333-333333333333");
    expect(res.values?.consent_expires).toBe("26 October 2026");
    for (const args of PUBLIC_PATHS) expect(revalidatePath).toHaveBeenCalledWith(...args);
  });
});
