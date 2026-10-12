"use client";

// One question answered by tapping a big button (no radio dots to aim at). The chosen value travels in a hidden
// input, so the form posts it like any other field.

type Option = { value: string; label: string; sub?: string };

const Tick = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export function TapChoice({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  error,
  layout = "stack",
}: {
  name: string;
  legend: string;
  hint?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  layout?: "stack" | "two" | "three" | "five";
}) {
  const errId = `${name}-err`;
  return (
    <fieldset className="q" data-field={name} aria-describedby={error ? errId : undefined}>
      <legend>{legend}</legend>
      {hint && <p className="hint">{hint}</p>}
      <div className={`taps taps-${layout}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              className="tap press"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
            >
              {layout === "stack" && (
                <span className="tap-dot" aria-hidden="true">
                  {on && <Tick />}
                </span>
              )}
              <span className="tap-label">
                {o.label}
                {o.sub && (
                  <>
                    {" "}
                    <small>{o.sub}</small>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value} />
      {error && (
        <p className="field-err" id={errId}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
