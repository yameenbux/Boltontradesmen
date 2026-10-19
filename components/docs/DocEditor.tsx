"use client";

import { useActionState, useState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { saveDoc } from "@/app/platform/provider/docs/actions";
import type { FormState } from "@/lib/admin-shared";
import { docTotal, KIND_TEXT, MAX_LINES, money, parsePence, parseQuantity, type DocKind, type DocLine } from "@/lib/trade-docs";

type Row = { description: string; quantity: string; price: string };

export type DocDraft = {
  id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  title: string;
  lines: DocLine[];
  notes: string;
  until: string;
  ask_review: boolean;
  job_request_id?: string | null;
};

const toRow = (l: DocLine): Row => ({
  description: l.description,
  quantity: String(l.quantity),
  price: (l.unit_pence / 100).toFixed(2),
});
const EMPTY: Row = { description: "", quantity: "1", price: "" };

/** Rows that are filled in properly, as lines; null when one is half done. */
function toLines(rows: Row[]): DocLine[] | null {
  const out: DocLine[] = [];
  for (const r of rows) {
    if (!r.description.trim() && !r.price.trim()) continue;
    const quantity = parseQuantity(r.quantity);
    const unit = parsePence(r.price);
    if (!r.description.trim() || quantity === null || unit === null) return null;
    out.push({ description: r.description.trim(), quantity, unit_pence: unit });
  }
  return out;
}

/** A quote or invoice: the customer, what it's for, the lines (quantity × price) and the total as you type. */
export function DocEditor({ providerId, kind, draft }: { providerId: string; kind: DocKind; draft: DocDraft }) {
  const [state, action, pending] = useActionState(saveDoc, {} as FormState);
  const [rows, setRows] = useState<Row[]>(draft.lines.length ? draft.lines.map(toRow) : [{ ...EMPTY }]);
  const lines = toLines(rows);
  const err = state.errors ?? {};
  const v = (k: keyof DocDraft) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : String(draft[k] ?? ""));

  const set = (i: number, k: keyof Row, value: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: value } : r)));

  return (
    <form action={action} className="auth-form doc-editor" aria-label={`${KIND_TEXT[kind]} details`}>
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="kind" value={kind} />
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      {draft.job_request_id && <input type="hidden" name="job_request_id" value={draft.job_request_id} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines ?? [])} />

      <label className="field">
        <span>Customer&apos;s name</span>
        <input name="customer_name" className="input" required minLength={2} maxLength={60} defaultValue={v("customer_name")} autoComplete="off" />
        {err.customer_name && <span className="field-err">{err.customer_name}</span>}
      </label>
      <label className="field">
        <span>
          Their mobile<span className="opt"> (optional)</span>
        </span>
        <span className="hint">For WhatsApp, and {kind === "invoice" ? "the review request once it's paid" : "sending it"}.</span>
        <input name="customer_phone" className="input" type="tel" inputMode="tel" defaultValue={v("customer_phone")} placeholder="07700 900123" />
        {err.customer_phone && <span className="field-err">{err.customer_phone}</span>}
      </label>
      <label className="field">
        <span>
          Their email<span className="opt"> (optional)</span>
        </span>
        <input name="customer_email" className="input" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={v("customer_email")} />
        {err.customer_email && <span className="field-err">{err.customer_email}</span>}
      </label>
      <label className="field">
        <span>What it&apos;s for</span>
        <input name="title" className="input" required minLength={2} maxLength={80} defaultValue={v("title")} placeholder="New kitchen tap" />
        {err.title && <span className="field-err">{err.title}</span>}
      </label>

      <fieldset className="doc-lines">
        <legend>Lines</legend>
        {rows.map((r, i) => (
          <div key={i} className="doc-line" role="group" aria-label={`Line ${i + 1}`}>
            <label className="field doc-desc">
              <span>Description</span>
              <input className="input" value={r.description} maxLength={120} onChange={(e) => set(i, "description", e.target.value)} />
            </label>
            <label className="field doc-qty">
              <span>Qty</span>
              <input className="input" inputMode="decimal" value={r.quantity} onChange={(e) => set(i, "quantity", e.target.value)} />
            </label>
            <label className="field doc-price">
              <span>Price (£)</span>
              <input className="input" inputMode="decimal" value={r.price} placeholder="0.00" onChange={(e) => set(i, "price", e.target.value)} />
            </label>
            {rows.length > 1 && (
              <button type="button" className="doc-remove" aria-label={`Remove line ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        {rows.length < MAX_LINES && (
          <button type="button" className="link doc-add" onClick={() => setRows((rs) => [...rs, { ...EMPTY }])}>
            + Add a line
          </button>
        )}
        <p className="doc-total" aria-live="polite">
          {lines === null ? "Finish each line: a description, a quantity and a price." : <>Total <b>{money(docTotal(lines))}</b></>}
        </p>
        {err.lines && <span className="field-err">{err.lines}</span>}
      </fieldset>

      <label className="field">
        <span>{kind === "quote" ? "Valid until" : "Due by"}</span>
        <input name="until" className="input" type="date" defaultValue={v("until")} />
        {err.until && <span className="field-err">{err.until}</span>}
      </label>
      <label className="field">
        <span>
          Notes<span className="opt"> (optional)</span>
        </span>
        <textarea name="notes" className="input textarea" rows={3} maxLength={1000} defaultValue={v("notes")} placeholder={kind === "quote" ? "Materials included. 50% up front." : "Thanks for your business."} />
        {err.notes && <span className="field-err">{err.notes}</span>}
      </label>
      {kind === "invoice" && (
        <label className="confirm-box">
          <input type="checkbox" name="ask_review" defaultChecked={draft.ask_review} />
          <span>When I mark it paid, ask the customer for an honest review</span>
        </label>
      )}
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending || lines === null || lines.length === 0} aria-busy={pending}>
        {pending ? "Saving…" : `Save ${kind}`}
      </Button>
    </form>
  );
}
