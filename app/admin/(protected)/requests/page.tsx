import Link from "next/link";
import { ApproveRequest, RequestActions } from "@/components/admin/RequestActions";
import { Pill } from "@/components/ui/Pill";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
import { listingsForPhones } from "@/lib/listing-duplicates";
import { nationalMobile } from "@/lib/phone-format";

export const dynamic = "force-dynamic";

type Status = "new" | "done" | "spam";
type Row = {
  id: string;
  created_at: string;
  business_name: string;
  contact_name: string;
  trade: string;
  area: string | null;
  phone_e164: string;
  email: string | null;
  message: string | null;
  status: Status;
  handled_at: string | null;
  plan: "free" | "pro";
  has_account: boolean;
  linked: boolean;
};

const AGREED = new Set(["consented", "live", "paused"]);

const VIEWS: { status: Status; label: string }[] = [
  { status: "new", label: "New" },
  { status: "done", label: "Done" },
  { status: "spam", label: "Spam" },
];

/** "07700 900123" for mobiles, "+441204123456" otherwise (the number as stored). */
const shownNumber = (e164: string) => nationalMobile(e164);

// A request from a trader's account stays new until it's approved here (approving marks it done), so saving the
// listing doesn't mark it done.
function newProviderHref(r: Row): string {
  const q = new URLSearchParams({ business: r.business_name, name: r.contact_name, phone: r.phone_e164 });
  if (!r.has_account) q.set("request", r.id);
  return `/admin/providers/new?${q.toString()}`;
}

/** "Get listed" requests from the public form. Phone numbers and emails are shown here only, to the admin. */
export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const raw = (await searchParams).status;
  const status: Status = VIEWS.find((v) => v.status === (Array.isArray(raw) ? raw[0] : raw))?.status ?? "new";
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_listing_requests", { p_status: status });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  // A request from a number that's already listed: link to that listing instead of offering a second one.
  const listed = await listingsForPhones(rows.map((r) => r.phone_e164));
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Listing requests</h1>
        <p className="a-lede">
          Traders asking to be listed. Create the listing from the request and send them the consent link; once
          they&apos;ve agreed, a request from a trader&apos;s account gets an Approve button that links the listing and
          notifies them. Requests are deleted 90 days after they were sent.
        </p>
      </div>
      <nav aria-label="Request status" className="admin-nav">
        {VIEWS.map((v) => (
          <Link
            key={v.status}
            href={v.status === "new" ? "/admin/requests" : `/admin/requests?status=${v.status}`}
            className="chip press"
            aria-current={v.status === status ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="empty">{status === "new" ? "No new requests." : `No requests marked ${status}.`}</p>
      ) : (
        <div className="mod-list">
          {rows.map((r) => (
            <article key={r.id} className="a-card mod-card" aria-label={`Request from ${r.business_name}`}>
              <div className="mod-flag-head">
                <Pill tone={r.status === "new" ? "gold" : "muted"}>{r.status}</Pill>
                <span>
                  <b>{r.business_name}</b> · {r.trade}
                </span>
                {r.plan === "pro" && <Pill tone="gold">Wants Pro</Pill>}
                {r.has_account && <Pill tone="muted">{r.linked ? "Account linked" : "Has an account"}</Pill>}
                <small>{dayMonthYear(r.created_at)}</small>
              </div>
              <dl className="a-dl">
                <dt>Name</dt>
                <dd>{r.contact_name}</dd>
                <dt>Area</dt>
                <dd>{r.area ?? "Not given"}</dd>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${r.phone_e164}`} className="a-link">
                    {shownNumber(r.phone_e164)}
                  </a>
                </dd>
                <dt>Email</dt>
                <dd>
                  {r.email ? (
                    <a href={`mailto:${r.email}`} className="a-link">
                      {r.email}
                    </a>
                  ) : (
                    "Not given"
                  )}
                </dd>
                {r.message && (
                  <>
                    <dt>Message</dt>
                    <dd className="whitespace-pre-line">{r.message}</dd>
                  </>
                )}
              </dl>
              {listed.has(r.phone_e164) ? (
                <p className="a-hint" data-testid="already-listed">
                  This number is already on{" "}
                  <Link href={`/admin/providers/${listed.get(r.phone_e164)!.id}`} className="a-link">
                    {listed.get(r.phone_e164)!.business_name}
                  </Link>
                  {listed.get(r.phone_e164)!.status === "removed" ? " (removed: use Reinvite there)" : ""}.
                </p>
              ) : (
                r.status === "new" && (
                  <Link href={newProviderHref(r)} className="a-link">
                    Create provider from this →
                  </Link>
                )
              )}
              {r.has_account && !r.linked && listed.has(r.phone_e164) && (
                AGREED.has(listed.get(r.phone_e164)!.status) ? (
                  <ApproveRequest
                    requestId={r.id}
                    providerId={listed.get(r.phone_e164)!.id}
                    phone={r.phone_e164}
                    business={listed.get(r.phone_e164)!.business_name}
                  />
                ) : (
                  <p className="a-hint">
                    Once they&apos;ve agreed to the listing, approve here: it links the listing to their account and
                    tells them by email and text{r.plan === "pro" ? ", with the link to pay for Pro" : ""}.
                  </p>
                )
              )}
              <RequestActions requestId={r.id} status={r.status} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
