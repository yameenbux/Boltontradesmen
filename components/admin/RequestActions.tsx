"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { approveRequest, setRequestStatus } from "@/app/admin/(protected)/requests/actions";
import type { FormState } from "@/lib/admin-shared";

/** Done and Spam for a new request; "Back to new" for one already dealt with. */
export function RequestActions({ requestId, status }: { requestId: string; status: "new" | "done" | "spam" }) {
  const [state, action, pending] = useActionState(setRequestStatus, {} as FormState);
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="request_id" value={requestId} />
      <div className="a-actions">
        {status === "new" ? (
          <>
            <Button type="submit" name="status" value="done" disabled={pending}>
              Done
            </Button>
            <Button type="submit" name="status" value="spam" variant="secondary" disabled={pending}>
              Spam
            </Button>
          </>
        ) : (
          <Button type="submit" name="status" value="new" variant="secondary" disabled={pending}>
            Back to new
          </Button>
        )}
      </div>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "a-ok" : "a-err"}>
          {state.message}
        </p>
      )}
    </form>
  );
}

/** For a request from a trader's account whose listing they've agreed to: link it and tell them. */
export function ApproveRequest({
  requestId,
  providerId,
  phone,
  business,
}: {
  requestId: string;
  providerId: string;
  phone: string;
  business: string;
}) {
  const [state, action, pending] = useActionState(approveRequest, {} as FormState);
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="phone" value={phone} />
      <div className="a-actions">
        <Button type="submit" disabled={pending || state.ok}>
          {pending ? "Approving…" : `Approve and notify (links ${business})`}
        </Button>
      </div>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "a-ok" : "a-err"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
