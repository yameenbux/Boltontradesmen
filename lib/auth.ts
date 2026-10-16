import "server-only";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createServerAuthClient } from "@/lib/supabase/server";

// Signed-in residents and providers (Google, email-code or phone accounts). Only the dynamic signed-in routes use these:
// they read the session cookie, which public pages must never do.

export type Account = {
  userId: string;
  displayName: string | null;
  district: string | null;
  role: "resident" | "provider" | "admin";
  deleted: boolean;
  createdAt: string;
  providers: { id: string; slug: string; businessName: string; status: string }[];
  /** How the account signs in (private.sign_in_kind); null for an unconfirmed account. */
  signInKind: "google" | "email" | "phone" | "admin" | null;
  email: string | null;
};

type AccountRow = {
  user_id: string;
  display_name: string | null;
  postcode_district: string | null;
  role: Account["role"];
  deleted: boolean;
  created_at: string;
  providers: { id: string; slug: string; business_name: string; status: string }[] | null;
  sign_in_kind?: Account["signInKind"];
  email?: string | null;
};

export function toAccount(row: AccountRow | null | undefined): Account | null {
  if (!row) return null;
  return {
    userId: row.user_id,
    displayName: row.display_name,
    district: row.postcode_district,
    role: row.role,
    deleted: row.deleted === true,
    createdAt: row.created_at,
    providers: (row.providers ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      businessName: p.business_name,
      status: p.status,
    })),
    signInKind: row.sign_in_kind ?? null,
    email: row.email ?? null,
  };
}

export function signInPath(next: string): string {
  return `/platform/sign-in?next=${encodeURIComponent(safeNext(next))}`;
}

export function welcomePath(next: string): string {
  return `/platform/welcome?next=${encodeURIComponent(safeNext(next))}`;
}

/** The signed-in person's client and user, or a redirect to sign-in that comes back to `next`. */
export async function requireSignedIn(next: string) {
  const supabase = await createServerAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(signInPath(next));
  return { supabase, user: data.user };
}

/** As requireSignedIn, plus a finished profile: no profile → Welcome; a deleted account is signed out. */
export async function requireMember(next: string) {
  const { supabase, user } = await requireSignedIn(next);
  const { data, error } = await supabase.rpc("my_account");
  if (error) throw new Error(`my_account failed: ${error.message}`);
  const account = toAccount(data as AccountRow | null);
  if (account?.deleted) {
    await supabase.auth.signOut();
    redirect(signInPath(next));
  }
  if (!account || !account.displayName) redirect(welcomePath(next));
  return { supabase, user, account };
}
