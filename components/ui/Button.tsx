"use client";

import { useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type PointerEvent } from "react";

type Variant = "primary" | "secondary";
type Common = { variant?: Variant; className?: string; children: React.ReactNode };
type AsLink = Common & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;
type AsButton = Common & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;
export type ButtonProps = AsLink | AsButton;

type Ripple = { id: number; x: number; y: number; size: number };

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Big tap-target button (min 56px tall). With `href` it renders a plain `<a>` (no client routing, so contact
 * links stay `<a rel="nofollow">` to /api/contact); otherwise a `<button>` (type defaults to "button").
 * Primary buttons show a tap ripple unless the user prefers reduced motion.
 */
export function Button(props: ButtonProps) {
  const { variant = "primary", className, children } = props;
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);
  const cls = ["btn", "press", `btn-${variant}`, className].filter(Boolean).join(" ");

  function addRipple(e: PointerEvent<HTMLElement>) {
    if (variant !== "primary" || reducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const id = nextId.current++;
    setRipples((list) => [...list, { id, x: e.clientX - r.left - size / 2, y: e.clientY - r.top - size / 2, size }]);
  }

  const rippleEls = ripples.map((rp) => (
    <span
      key={rp.id}
      className="ripple"
      aria-hidden="true"
      style={{ width: rp.size, height: rp.size, left: rp.x, top: rp.y }}
      onAnimationEnd={() => setRipples((list) => list.filter((x) => x.id !== rp.id))}
    />
  ));

  if (props.href !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variant: _v, className: _c, children: _ch, onPointerDown, ...rest } = props;
    return (
      <a
        {...rest}
        className={cls}
        onPointerDown={(e) => {
          addRipple(e);
          onPointerDown?.(e);
        }}
      >
        {children}
        {rippleEls}
      </a>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, className: _c, children: _ch, href: _h, onPointerDown, type = "button", ...rest } = props;
  return (
    <button
      {...rest}
      type={type}
      className={cls}
      onPointerDown={(e) => {
        addRipple(e);
        onPointerDown?.(e);
      }}
    >
      {children}
      {rippleEls}
    </button>
  );
}
