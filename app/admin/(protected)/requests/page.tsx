import Link from "next/link";
import { RequestActions } from "@/components/admin/RequestActions";
import { Pill } from "@/components/ui/Pill";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
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
};

const VIEWS: { status: Status; label: string }[] = [
  { status: "new", label: "New" },
  { status: "done", label: "Done" },
  { status: "spam", label: "Spam" },
];

/** "07700 900123" for mobiles, "+441204123456" otherwise (the number as stored). */
const shownNumber = (e164: string) => nationalMobile(e164);

function newProviderHref(r: Row): string {
  const q = new URLSearchParams({ business: r.business_name, name: r.contact_name, phone: r.phone_e164, request: r.id });
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
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Listing requests</h1>
        <p className="a-lede">
          Traders asking to be listed, from the Get listed form. WhatsApp or call them within 2 working days, then mark
          the request done. Requests are deleted 90 days after they were sent.
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
              {r.status === "new" && (
                <Link href={newProviderHref(r)} className="a-link">
                  Create provider from this →
                </Link>
              )}
              <RequestActions requestId={r.id} status={r.status} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
