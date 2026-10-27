"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LOGO_ACCEPT, LOGO_WRONG_TYPE, MAX_LOGO_BYTES, LOGO_TOO_BIG } from "@/lib/brand";

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);

/**
 * The logo box: a square preview (the chosen file, else the current logo, else a dashed placeholder) beside the file
 * picker. Lives inside a form; the file goes with it under `name`. Checks type and size as soon as a file is chosen,
 * and clears a refused file, so a wrong one is never sent.
 */
export function LogoPick({
  id,
  name = "logo",
  current = null,
  error,
  hint,
  onChange,
}: {
  id: string;
  name?: string;
  /** The logo already on the listing (its public address). */
  current?: string | null;
  /** The server's message for this field. */
  error?: string;
  hint: string;
  onChange?: (file: File | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [localErr, setLocalErr] = useState("");
  // A local address for the chosen file, released when it changes or the box goes away.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  // React empties the form after each send (form.reset()), file box included: drop the preview with it.
  const input = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const clear = () => {
      setFile(null);
      onChangeRef.current?.(null);
    };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setLocalErr("");
    if (f && !LOGO_ACCEPT.split(",").includes(f.type)) {
      setLocalErr(LOGO_WRONG_TYPE);
      e.target.value = "";
      setFile(null);
      onChange?.(null);
      return;
    }
    if (f && f.size > MAX_LOGO_BYTES) {
      setLocalErr(LOGO_TOO_BIG);
      e.target.value = "";
      setFile(null);
      onChange?.(null);
      return;
    }
    setFile(f);
    onChange?.(f);
  }

  const shown = preview ?? current;
  const msg = localErr || error;
  return (
    <div className="logo-pick">
      <span className={shown ? "logo-preview" : "logo-preview is-empty"} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) or the stored logo */}
        {shown ? <img src={shown} alt="" /> : <span>Logo</span>}
      </span>
      <div className="field logo-field">
        <label htmlFor={id}>{current ? "Change your logo" : "Your logo"}</label>
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
        <span className={file ? "file-pick has-file" : "file-pick"}>
          <input
            ref={input}
            id={id}
            name={name}
            type="file"
            accept={LOGO_ACCEPT}
            onChange={pick}
            aria-invalid={msg ? true : undefined}
            aria-describedby={`${id}-hint${msg ? ` ${id}-err` : ""}`}
          />
          <span className="file-face" aria-hidden="true">
            <UploadIcon />
            <span>{file?.name ?? "Choose an image"}</span>
          </span>
        </span>
        {msg && (
          <span id={`${id}-err`} className="field-err">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
