"use client";

import { Button } from "@/components/ui/Button";

/** Opens the browser's print dialog; "Save as PDF" there gives a file to send. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
      Print or save as PDF
    </Button>
  );
}
