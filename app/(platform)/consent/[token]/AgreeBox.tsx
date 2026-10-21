"use client";

import { createContext, useContext } from "react";

/** Whether the trader has ticked the terms and privacy box; ConsentForm owns the state. */
export const AgreeContext = createContext<{ agreed: boolean; setAgreed: (v: boolean) => void }>({
  agreed: false,
  setAgreed: () => {},
});

/** The tick box on the agreement card. The card's text (its label) is the hashed paragraph, unchanged. */
export function AgreeBox({ children }: { children: React.ReactNode }) {
  const { agreed, setAgreed } = useContext(AgreeContext);
  return (
    <label className="agree">
      <input
        type="checkbox"
        name="agree"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        aria-describedby="agree-hint"
      />
      {children}
    </label>
  );
}
