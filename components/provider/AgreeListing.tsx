"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { ConsentParagraph } from "@/components/consent/ConsentParagraph";
import { Button } from "@/components/ui/Button";
import { agreeMyListing } from "@/app/(platform)/provider/agree-actions";
import type { FormState } from "@/lib/admin-shared";
import type { ConsentCard } from "@/lib/consent-shared";

/**
 * For a listing the admin made and linked to this account, not yet agreed to: the listing statement (the consent
 * page's, word for word) and one tick, and it goes live. No consent link needed.
 */
export function AgreeListing({ providerId, cards }: { providerId: string; cards: ConsentCard[] }) {
  const [state, action, pending] = useActionState(agreeMyListing, {} as FormState);
  const points = cards.filter((c) => c.key !== "privacy" && c.key !== "controller");
  const agreement = cards.find((c) => c.key === "privacy");
  const controller = cards.find((c) => c.key === "controller");
  return (
    <form action={action} className="auth-form" data-testid="agree-listing">
      <input type="hidden" name="provider_id" value={providerId} />
      <h2 className="avail-legend">One tick and you&apos;re live</h2>
      <ul className="points points-plain">
        {points.map((card) => (
          <li key={card.key}>
            <ConsentParagraph card={card} />
          </li>
        ))}
      </ul>
      {controller && (
        <div className="controller">
          <ConsentParagraph card={controller} />
        </div>
      )}
      {agreement && (
        <label className={`confirm-box${state.errors?.agree ? " has-err" : ""}`}>
          <input type="checkbox" name="agree" value="yes" required
            {...(state.errors?.agree ? { "aria-invalid": true as const, "aria-describedby": "agree-err" } : {})} />
          <ConsentParagraph card={agreement} />
        </label>
      )}
      {state.errors?.agree && (
        <span id="agree-err" className="field-err">
          {state.errors.agree}
        </span>
      )}
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Putting you live…" : "Put my listing live"}
      </Button>
    </form>
  );
}
