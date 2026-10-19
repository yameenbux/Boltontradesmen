"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { setJobRequestStatus } from "@/app/platform/provider/jobs-actions";
import { nationalNumber } from "@/lib/alert-text";
import { JOB_STATUS_TEXT, JOB_STATUSES, type JobStatus } from "@/lib/job-request";

export type JobRequestRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  district: string;
  body: string;
  status: JobStatus;
  created_at: string;
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" }).format(
    new Date(iso),
  );

// wa.me wants the number without the +.
const waLink = (e164: string, name: string, business: string) =>
  `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(`Hi ${name}, it's ${business} — thanks for your request on Bolton Vouched.`)}`;

function RequestCard({ r, business }: { r: JobRequestRow; business: string }) {
  const [status, setStatus] = useState<JobStatus>(r.status);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const mobile = /^\+447/.test(r.phone);

  function choose(next: JobStatus) {
    const prev = status;
    setStatus(next);
    setFailed(false);
    start(async () => {
      const res = await setJobRequestStatus(r.id, next);
      if (!res.ok) {
        setStatus(prev);
        setFailed(true);
      }
    });
  }

  return (
    <article className="job" aria-label={`Request from ${r.name}`} data-status={status}>
      <div className="job-head">
        <b>{r.name}</b>
        <span>
          {r.district} · {nationalNumber(r.phone)} · {when(r.created_at)}
        </span>
      </div>
      <p className="job-body">{r.body}</p>
      <div className={mobile ? "q-contact" : "q-contact one"}>
        <Button href={`tel:${r.phone}`} aria-label={`Call ${r.name} on ${nationalNumber(r.phone)}`}>
          Call
        </Button>
        {mobile && (
          <Button href={waLink(r.phone, r.name, business)} variant="secondary" target="_blank" rel="noopener">
            WhatsApp
          </Button>
        )}
      </div>
      <Button href={`/platform/provider/docs/new?kind=quote&request=${r.id}`} variant="secondary">
        Write a quote
      </Button>
      {r.email && (
        <a className="link" href={`mailto:${r.email}`}>
          {r.email}
        </a>
      )}
      <label className="field job-status">
        <span>Where it&apos;s up to</span>
        <span className="select">
          <select className="input" value={status} disabled={pending} onChange={(e) => choose(e.target.value as JobStatus)}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_TEXT[s]}
              </option>
            ))}
          </select>
          <ChevronDown />
        </span>
      </label>
      {failed && (
        <p role="alert" className="form-alert">
          That didn&apos;t save. Please try again.
        </p>
      )}
    </article>
  );
}

/** A Pro trader's job requests from their page, newest first, with one-tap Call and WhatsApp back. */
export function JobRequests({ requests, business }: { requests: JobRequestRow[]; business: string }) {
  if (requests.length === 0) {
    return (
      <p className="reviews-empty">
        No requests yet. When someone uses &ldquo;Request a quote&rdquo; on your page, it shows here and you get a text
        straight away.
      </p>
    );
  }
  return (
    <div className="job-list" data-testid="job-requests">
      {requests.map((r) => (
        <RequestCard key={r.id} r={r} business={business} />
      ))}
    </div>
  );
}
