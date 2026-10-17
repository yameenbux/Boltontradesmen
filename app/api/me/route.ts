import { NextResponse } from "next/server";
import { firstNameOf } from "@/lib/greeting";
import { createServerAuthClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

// The signed-in person's first name, for the home page greeting. The home page itself stays static and cookie-free;
// its greeting asks here only when the browser holds a sign-in cookie.
export async function GET() {
  try {
    const supabase = await createServerAuthClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ firstName: null }, { headers });
    const { data: account } = await supabase.rpc("my_account");
    const row = account as { display_name: string | null; deleted: boolean } | null;
    const firstName = row && !row.deleted ? firstNameOf(row.display_name) : null;
    return NextResponse.json({ firstName }, { headers });
  } catch {
    return NextResponse.json({ firstName: null }, { headers });
  }
}
