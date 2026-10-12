"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { setRequestStatus } from "@/app/admin/(protected)/requests/actions";
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
