"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { pauseMyListing, unpauseMyListing, withdrawMyListing } from "@/app/(platform)/provider/actions";
import type { FormState } from "@/lib/admin-shared";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return state.ok ? (
    <p role="status" className="form-ok">
      <TickIcon />
      {state.message}
    </p>
  ) : (
    <p role="alert" className="form-alert">
      <AlertIcon />
      {state.message}
    </p>
  );
}

/**
 * A button that opens a confirm dialog (native <dialog>: focus is trapped and Escape closes it), whose form runs
 * the action. The dialog closes once the action has worked.
 */
function Confirm({
  providerId,
  action,
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  needsTick,
}: {
  providerId: string;
  action: Action;
  open: string;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  needsTick?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `${providerId}-${confirmLabel.replace(/\W+/g, "-").toLowerCase()}`;
  const tickErr = state.errors?.confirm;

  useEffect(() => {
    if (state.ok) dialog.current?.close();
  }, [state]);

  return (
    <>
      <Button
        variant="secondary"
        className={danger ? "btn-danger" : undefined}
        onClick={() => dialog.current?.showModal()}
      >
        {open}
      </Button>
      {state.ok && <Result state={state} />}
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId}>
        <form action={formAction} className="auth-form">
          <input type="hidden" name="provider_id" value={providerId} />
          <h3 id={titleId}>{title}</h3>
          <div className="confirm-body">{children}</div>
          {needsTick && (
            <>
              <label className={`confirm-box${tickErr ? " has-err" : ""}`}>
                <input
                  type="checkbox"
                  name="confirm"
                  aria-invalid={tickErr ? true : undefined}
                  aria-describedby={tickErr ? `${titleId}-err` : undefined}
                />
                <span>{needsTick}</span>
              </label>
              {tickErr && (
                <span id={`${titleId}-err`} className="field-err">
                  {tickErr}
                </span>
              )}
            </>
          )}
          {!state.ok && <Result state={state} />}
          <div className="confirm-actions">
            <Button type="submit" className={danger ? "btn-danger-solid" : undefined} disabled={pending} aria-busy={pending}>
              {pending ? "Please wait…" : confirmLabel}
            </Button>
            <Button variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Unpause({ providerId }: { providerId: string }) {
  const [state, formAction, pending] = useActionState(unpauseMyListing, {} as FormState);
  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Unpausing…" : "Unpause my listing"}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Pause or unpause, and Withdraw. What shows depends on the listing's status and who paused it. */
export function ListingStatus({
  providerId,
  status,
  pausedBy,
}: {
  providerId: string;
  status: string;
  pausedBy: "trader" | "admin" | null;
}) {
  return (
    <div className="listing-status">
      {status === "live" && (
        <div className="status-row">
          <p className="status-text">
            <b>Taking a break?</b> Pause your listing and it&apos;s hidden from Bolton Vouched until you unpause it. Your
            reviews are kept.
          </p>
          <Confirm
            providerId={providerId}
            action={pauseMyListing}
            open="Pause my listing"
            title="Pause your listing?"
            confirmLabel="Yes, pause it"
          >
            <p>
              Your page and your card come off Bolton Vouched straight away, and links to your page stop working. Your
              reviews are kept, and you can unpause from here at any time.
            </p>
          </Confirm>
        </div>
      )}
      {status === "paused" && pausedBy === "trader" && (
        <div className="status-row">
          <p className="status-text">
            <b>Your listing is paused.</b> Customers can&apos;t see it. Unpause and it&apos;s back straight away, reviews
            and all.
          </p>
          <Unpause providerId={providerId} />
        </div>
      )}
      {status === "paused" && pausedBy !== "trader" && (
        <p className="form-note" data-testid="paused-by-us">
          We&apos;ve paused your listing. Contact us and we&apos;ll sort it out.
        </p>
      )}
      <div className="status-row">
        <p className="status-text">
          <b>Leaving Bolton Vouched?</b> Withdraw your listing to take it down for good.
        </p>
        <Confirm
          providerId={providerId}
          action={withdrawMyListing}
          open="Withdraw my listing"
          title="Withdraw your listing?"
          confirmLabel="Withdraw my listing"
          danger
          needsTick="I understand I can only come back with a new invite"
        >
          <p>Your page, card and website badge come off Bolton Vouched straight away, and your reviews are hidden with it.</p>
          <p>
            <b>You can&apos;t undo this yourself.</b> To be listed again you&apos;d need a new invite from us, and to agree
            to be listed again. If you only need a break, pause instead.
          </p>
        </Confirm>
      </div>
    </div>
  );
}
