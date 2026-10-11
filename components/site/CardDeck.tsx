"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DeckCard } from "@/components/site/content";
import { Icon } from "@/components/site/icons";
import { Phone } from "@/components/site/Phone";

const AUTO_MS = 5200;
const DRAG_AWAY_PX = 80;

const noop = () => () => {};
const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Inside Bolton Vouched": a stack of cards, one screenshot each. Drag the top card away (either side) or use the arrows;
 * it auto-advances every few seconds while on screen, unless paused, hovered, focused, or reduced motion is on.
 * Without JavaScript (server HTML) the same cards are a sideways scroll-snap row, so every card is still reachable.
 */
export function CardDeck({ cards, label }: { cards: DeckCard[]; label: string }) {
  const n = cards.length;
  const live = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const reduce = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );

  const [index, setIndex] = useState(0);
  const [side, setSide] = useState(-1); // where the last card flew off to: -1 left, 1 right
  const [userPaused, setUserPaused] = useState<boolean | null>(null); // null: not chosen yet
  const [hold, setHold] = useState(false); // hover or keyboard focus inside the deck
  const [onScreen, setOnScreen] = useState(false);
  const [drag, setDrag] = useState<{ id: number; x0: number; dx: number } | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  const paused = userPaused ?? reduce;
  const playing = live && !paused && !hold && !drag && onScreen;

  const go = useCallback(
    (step: 1 | -1, flyTo: -1 | 1 = -1) => {
      if (step === 1) setSide(flyTo);
      setIndex((i) => (i + step + n) % n);
    },
    [n],
  );

  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      if (!document.hidden) go(1);
    }, AUTO_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, go]);

  function pos(k: number): string {
    const p = (k - index + n) % n;
    if (p === n - 1) return "gone";
    return p <= 2 ? String(p) : "back";
  }

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: e.pointerId, x0: e.clientX, dx: 0 });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (drag && e.pointerId === drag.id) setDrag({ ...drag, dx: e.clientX - drag.x0 });
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.abs(drag.dx) > DRAG_AWAY_PX) go(1, drag.dx > 0 ? 1 : -1);
    setDrag(null);
  };

  return (
    <div
      ref={deckRef}
      className={`s-deck${live ? " live" : ""}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="s-deck-stage" aria-live={live && !playing ? "polite" : "off"}>
        {cards.map((c, k) => {
          const p = live ? pos(k) : "0";
          const top = p === "0";
          const dragging = top && drag !== null;
          return (
            <article
              key={c.shot}
              className={`s-card${dragging ? " dragging" : ""}`}
              data-tone={c.tone}
              data-pos={live ? p : undefined}
              role="group"
              aria-roledescription="card"
              aria-label={`${k + 1} of ${n}: ${c.title}`}
              aria-hidden={live && !top ? true : undefined}
              inert={live && !top ? true : undefined}
              style={
                {
                  "--side": side,
                  ...(dragging ? { transform: `translateX(${drag.dx}px) rotate(${drag.dx / 22}deg)` } : {}),
                } as React.CSSProperties
              }
              onPointerDown={live && top ? onPointerDown : undefined}
              onPointerMove={live && top ? onPointerMove : undefined}
              onPointerUp={live && top ? onPointerEnd : undefined}
              onPointerCancel={live && top ? onPointerEnd : undefined}
            >
              <Phone shot={c.shot} alt={c.alt} crop={c.crop} sizes="(min-width: 480px) 220px, 58vw" />
              <span className={`s-tag${c.soon ? " soon" : ""}`}>{c.soon ? "Coming soon" : "On the platform"}</span>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </article>
          );
        })}
      </div>

      <div className="s-deck-ctrl">
        <button type="button" className="s-round" aria-label="Previous card" onClick={() => go(-1)}>
          <Icon name="arrowLeft" />
        </button>
        <span className="s-count" data-testid="deck-counter">
          {pad(index + 1)} <span>/ {pad(n)}</span>
        </span>
        <button type="button" className="s-round" aria-label="Next card" onClick={() => go(1)}>
          <Icon name="arrowRight" />
        </button>
      </div>
      <div className="s-deck-ctrl">
        <button type="button" className="s-pause" onClick={() => setUserPaused(!paused)}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
    </div>
  );
}
