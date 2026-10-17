import Image from "next/image";
import { DocumentForm, ManageBillingForm, PhotoActions, PhotoUploadForm } from "@/components/provider/ProForms";
import { Pill } from "@/components/ui/Pill";
import { dayMonthYear } from "@/lib/checks";
import { plural, type EnquiryStats } from "@/lib/enquiries";
import {
  DOCUMENT_LABEL,
  MAX_WORK_PHOTOS,
  monthlyReport,
  subscriptionLine,
  workPhotoUrl,
  type ProStatus,
} from "@/lib/pro";

// The trader's Pro panel: the subscription and Manage billing, the ID check, the work photos and the monthly report.
// Shown once there's a subscription (or photos to manage after one ended). "Pro" is only ever said here and in admin.

const DOC_STATUS = { pending: "Being checked", approved: "Checked", rejected: "Not accepted" } as const;

function IdCheck({ providerId, pro }: { providerId: string; pro: ProStatus }) {
  const id = pro.idCheck;
  const others = pro.documents.filter((d) => d.kind !== "photo_id");
  return (
    <section className="pro-block" aria-labelledby={`idc-${providerId}`}>
      <h3 id={`idc-${providerId}`}>ID check</h3>
      {id.status === "approved" ? (
        <p className="form-ok" data-testid="id-status">
          ID checked{id.decidedAt ? ` on ${dayMonthYear(id.decidedAt)}` : ""}.{" "}
          {pro.isPro ? "Your page shows “ID checked”." : "It shows again on your page when Pro is on."}
        </p>
      ) : id.status === "pending" ? (
        <p className="form-note" data-testid="id-status">
          We&apos;ve got your photo ID and we&apos;re checking it. You&apos;ll see the answer here, usually within two
          working days.
        </p>
      ) : id.status === "rejected" ? (
        <p className="form-alert" data-testid="id-status">
          We couldn&apos;t accept your photo ID{id.reason ? `: ${id.reason}` : "."} Send another below. If we can&apos;t
          check your ID, we refund your Pro payment in full.
        </p>
      ) : (
        <p className="pro-small" data-testid="id-status">
          Send a photo of your passport or driving licence. Once we&apos;ve checked it, your page shows &ldquo;ID
          checked&rdquo;. You can also send your insurance certificate or a trade accreditation, and we&apos;ll add it
          to &ldquo;What we&apos;ve checked&rdquo;.
        </p>
      )}
      {others.length > 0 && (
        <ul className="pro-docs">
          {others.map((d) => (
            <li key={d.id}>
              <b>{DOCUMENT_LABEL[d.kind]}</b> sent {dayMonthYear(d.createdAt)} ·{" "}
              <span>
                {DOC_STATUS[d.status]}
                {d.status === "rejected" && d.reason ? `: ${d.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pro.isPro && <DocumentForm providerId={providerId} idNeeded={id.status === "none" || id.status === "rejected"} />}
    </section>
  );
}

function Photos({ providerId, pro, businessName }: { providerId: string; pro: ProStatus; businessName: string }) {
  const photos = pro.photos;
  return (
    <section className="pro-block" aria-labelledby={`photos-${providerId}`}>
      <h3 id={`photos-${providerId}`}>
        Work photos <em>{photos.length} of {MAX_WORK_PHOTOS}</em>
      </h3>
      {!pro.isPro && photos.length > 0 && (
        <p className="form-note">
          Hidden from your page while Pro is off. They come back if you restart it, and you can remove them any time.
        </p>
      )}
      {photos.length === 0 ? (
        <p className="pro-small">No photos yet. They show on your page in this order.</p>
      ) : (
        <ol className="photo-grid" aria-label="Your work photos, in page order">
          {photos.map((p, i) => {
            const src = workPhotoUrl(p.path);
            return (
              <li key={p.id}>
                {src && (
                  <Image
                    src={src}
                    alt={`Work by ${businessName}, photo ${i + 1}`}
                    width={p.width}
                    height={p.height}
                    sizes="(max-width: 480px) 45vw, 200px"
                    unoptimized
                  />
                )}
                <PhotoActions providerId={providerId} photoId={p.id} n={i + 1} of={photos.length} canMove={pro.isPro} />
              </li>
            );
          })}
        </ol>
      )}
      {pro.isPro && photos.length < MAX_WORK_PHOTOS && (
        <PhotoUploadForm providerId={providerId} left={MAX_WORK_PHOTOS - photos.length} />
      )}
    </section>
  );
}

function Report({ providerId, stats }: { providerId: string; stats: EnquiryStats }) {
  const r = monthlyReport(stats);
  return (
    <section className="pro-block" aria-labelledby={`report-${providerId}`}>
      <h3 id={`report-${providerId}`}>Monthly report</h3>
      {!r ? (
        <p className="pro-small">Your first report shows here at the start of next month.</p>
      ) : (
        <div className="pro-report" data-testid="monthly-report">
          <p className="pro-report-head">
            <b>{r.label}</b>
            <span>{plural(r.enquiries, "enquiry", "enquiries")}</span>
          </p>
          <dl className="stat-strip">
            <div className="stat">
              <dt>Calls</dt>
              <dd>{r.calls}</dd>
            </div>
            <div className="stat">
              <dt>WhatsApps</dt>
              <dd>{r.whatsapps}</dd>
            </div>
          </dl>
          <ul className="pro-list">
            {r.change !== null && r.previousLabel && (
              <li>
                {r.change === 0
                  ? `The same as ${r.previousLabel}.`
                  : `${plural(Math.abs(r.change), "enquiry", "enquiries")} ${r.change > 0 ? "more" : "fewer"} than ${r.previousLabel}.`}
              </li>
            )}
            {r.busiest && (
              <li>
                Busiest of the last five months: {r.busiest.label} ({plural(r.busiest.enquiries, "enquiry", "enquiries")}).
              </li>
            )}
          </ul>
          <p className="pro-small">
            Enquiries are counted the same way as above. We don&apos;t record where callers are, so there&apos;s no
            split by area.
          </p>
        </div>
      )}
    </section>
  );
}

export function ProPanel({
  providerId,
  businessName,
  pro,
  stats,
  billing,
}: {
  providerId: string;
  businessName: string;
  pro: ProStatus;
  stats: EnquiryStats;
  /** Stripe is set up, so Manage billing can open. */
  billing: boolean;
}) {
  const line = pro.subscription ? subscriptionLine(pro.subscription, pro.isPro) : null;
  return (
    <section className="auth-card pro-panel" aria-labelledby={`pro-${providerId}`}>
      <div className="pro-panel-head">
        <h2 id={`pro-${providerId}`}>Pro</h2>
        <Pill tone={pro.isPro ? "sage" : "muted"}>{pro.isPro ? "On" : "Off"}</Pill>
      </div>
      {line && (
        <p className={line.tone === "ok" ? "pro-status" : line.tone === "warn" ? "form-note" : "pro-status is-off"} data-testid="pro-status">
          {line.text}
        </p>
      )}
      {billing && pro.subscription && <ManageBillingForm providerId={providerId} />}
      {pro.isPro && (
        <p className="pro-small">
          Pro never changes where you&apos;re listed or your badges. Withdrawing your listing cancels Pro at the end of
          the period you&apos;ve paid for.
        </p>
      )}
      <IdCheck providerId={providerId} pro={pro} />
      <Photos providerId={providerId} pro={pro} businessName={businessName} />
      {pro.isPro && <Report providerId={providerId} stats={stats} />}
    </section>
  );
}
