import type { CSSProperties } from "react";

// Bolton at dusk: a cotton mill, a row of terraces, the Town Hall clock tower and a second mill, with distant chimneys
// behind. Decorative (aria-hidden). Server-rendered SVG: every shape is complete in the markup, and the draw-on, fill
// and lit-window animations in globals.css (.skyline) only play over that finished picture.

type Shape = { el: "path" | "rect" | "circle" | "polygon"; a: Record<string, string | number> };

const FAR: Shape[] = [
  { el: "polygon", a: { points: "96,200 96,132 150,132 150,200" } },
  { el: "polygon", a: { points: "122,132 125,70 133,70 136,132" } },
  { el: "polygon", a: { points: "640,200 640,124 712,124 712,200" } },
  { el: "polygon", a: { points: "690,124 693,58 701,58 704,124" } },
  { el: "polygon", a: { points: "300,200 300,150 352,150 352,200" } },
];

const NEAR: Shape[] = [
  { el: "polygon", a: { points: "30,200 30,92 200,92 200,200" } },
  { el: "polygon", a: { points: "168,92 172,8 186,8 190,92" } },
  { el: "path", a: { d: "M210 200 V150 L235 130 L260 150 L285 130 L310 150 L335 130 L360 150 L380 136 V200 Z" } },
  { el: "path", a: { d: "M228 138 v-14 h8 v8 M302 138 v-14 h8 v8" } },
  { el: "rect", a: { x: 400, y: 110, width: 160, height: 90 } },
  { el: "path", a: { d: "M412 200 V130 M434 200 V130 M526 200 V130 M548 200 V130 M400 130 H560" } },
  { el: "rect", a: { x: 455, y: 34, width: 50, height: 76 } },
  { el: "circle", a: { cx: 480, cy: 66, r: 12 } },
  { el: "path", a: { d: "M480 66 V58 M480 66 L486 70" } },
  { el: "path", a: { d: "M455 34 Q480 -2 505 34 M480 6 V-14" } },
  { el: "path", a: { d: "M590 200 V82 L620 66 V82 L650 66 V82 L680 66 V82 L710 66 V82 L770 82 V200 Z" } },
  { el: "polygon", a: { points: "740,82 744,-6 758,-6 762,82" } },
];

// Lit windows: a grid per mill, with a few left dark so it reads as a real building.
function windows(x0: number, y0: number, cols: number, rows: number, dx: number, dy: number) {
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r * 7 + c * 3) % 5 !== 0) out.push({ x: x0 + c * dx, y: y0 + r * dy });
  return out;
}
const WINDOWS = [...windows(42, 104, 7, 4, 21, 23), ...windows(602, 96, 7, 4, 23, 25), { x: 476, y: 84 }];

const order = (i: number) => ({ "--i": i }) as CSSProperties;

function draw({ el: El, a }: Shape, i: number, cls: string) {
  return <El key={i} {...a} className={cls} pathLength={1} style={order(i)} />;
}

export function BoltonSkyline({ className }: { className?: string }) {
  return (
    <svg
      className={["skyline", className].filter(Boolean).join(" ")}
      viewBox="0 -20 800 220"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <g className="skyline-far">{FAR.map((s, i) => draw(s, i, "art-far"))}</g>
      <g className="skyline-near">{NEAR.map((s, i) => draw(s, i, "art-shape"))}</g>
      <g className="skyline-lit">
        {WINDOWS.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width={9} height={12} rx={1} className="art-lit" style={order(i)} />
        ))}
      </g>
    </svg>
  );
}
