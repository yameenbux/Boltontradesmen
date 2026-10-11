"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { StickyBar } from "@/components/ui/StickyBar";
import { acceptConsent } from "./actions";
import { InvalidLink } from "./InvalidLink";

/**
 * The consent statement (server-rendered, passed as children) with the sticky "I agree, list me" bar.
 * On success the statement is replaced by the drawn-tick confirmation; a used or stale link shows the invalid state.
 */
export function ConsentForm({
  token,
  firstName,
  children,
}: {
  token: string;
  firstName: string | null;
  children: React.ReactNode;
}) {
  const [result, setResult] = useState<"ok" | "invalid" | "error" | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);

  // The statement is replaced in place: return to the top and move focus to the new heading.
  useEffect(() => {
    if (result !== "ok" && result !== "invalid") return;
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [result]);

  if (result === "ok") {
    return (
      <div className="done">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" />
          <path d="M30 52 44 65 71 37" />
        </svg>
        <h1 className="display" ref={heading} tabIndex={-1}>
          {firstName ? `You're all set, ${firstName}` : "You're all set"}
        </h1>
        <p>Thanks. Your listing goes live once Yameen has checked it, usually within a day.</p>
      </div>
    );
  }
  if (result === "invalid") return <InvalidLink headingRef={heading} />;

  return (
    <>
      {children}
      <StickyBar label="Agree to be listed">
        {result === "error" && (
          <p role="alert" className="bar-error">
            Something went wrong. Please try again.
          </p>
        )}
        <div className="inner one">
          <Button
            variant="primary"
            disabled={pending}
            aria-busy={pending}
            onClick={() =>
              start(async () => {
                try {
                  setResult((await acceptConsent(token)).status);
                } catch {
                  setResult("error");
                }
              })
            }
          >
            I agree, list me
          </Button>
        </div>
      </StickyBar>
    </>
  );
}
