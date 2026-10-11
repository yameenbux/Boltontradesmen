"use client";

import { useState, useTransition } from "react";
import { acceptConsent } from "./actions";

export function ConsentForm({ token }: { token: string }) {
  const [result, setResult] = useState<"ok" | "invalid" | "error" | null>(null);
  const [pending, start] = useTransition();

  if (result === "ok") {
    return <p role="status" className="text-xl font-extrabold">Thanks — you&apos;re all set</p>;
  }
  if (result === "invalid") {
    return <p role="alert" className="text-xl font-extrabold">This link is no longer valid</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult((await acceptConsent(token)).status))}
        className="min-h-12 rounded bg-neutral-900 px-4 font-bold text-white disabled:opacity-60"
      >
        I agree
      </button>
      {result === "error" && (
        <p role="alert" className="font-semibold text-red-800">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}
