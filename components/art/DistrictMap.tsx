import type { CSSProperties } from "react";
import { BL_DISTRICTS } from "@/lib/districts";

// Bolton's seven postcode districts, roughly where they sit (BL7 north, BL5 south-west, BL4 south-east), drawn as
// hexagons that outline themselves in turn. A picture of coverage, not a map to navigate by: decorative, so the
// page states the districts in its own text.

const CENTRES: Record<string, [number, number]> = {
  BL7: [150, 44],
  BL6: [62, 98],
  BL1: [150, 112],
  BL2: [238, 98],
  BL5: [70, 196],
  BL3: [152, 186],
  BL4: [236, 198],
};

function hex([cx, cy]: [number, number], r = 40) {
  return Array.from({ length: 6 }, (_, k) => {
    const t = (Math.PI / 3) * k + Math.PI / 6;
    return `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`;
  }).join(" ");
}

export function DistrictMap({ className }: { className?: string }) {
  const codes = BL_DISTRICTS.filter((c) => c in CENTRES);
  return (
    <svg className={["district-map", className].filter(Boolean).join(" ")} viewBox="0 0 300 250" aria-hidden="true" focusable="false">
      {codes.map((code, i) => {
        const at = CENTRES[code];
        return (
          <g key={code} style={{ "--i": i } as CSSProperties}>
            <polygon points={hex(at)} pathLength={1} className="district" />
            <text x={at[0]} y={at[1] + 6} textAnchor="middle" className="district-code">
              {code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
