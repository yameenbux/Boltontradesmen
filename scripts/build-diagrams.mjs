/**
 * Renders assets/diagrams/*.mmd to the animated SVGs the README embeds.
 *
 * Why not ```mermaid fences in the README: GitHub renders mermaid but cannot
 * animate it. An SVG file can, so the connectors carry a travelling dash that
 * shows which way information moves. The .mmd files stay in the repo so the
 * diagrams are still text somebody can edit and diff.
 *
 *   node scripts/build-diagrams.mjs
 *
 * Needs a Chromium for mermaid-cli. Point it at one you already have with
 *   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node scripts/build-diagrams.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SRC = "assets/diagrams";

/**
 * The Bolton Brick palette (docs/design/bolton-vouched-prototype.html and
 * app/globals.css) as CSS custom properties inside the SVG: light first,
 * redefined under prefers-color-scheme. An SVG loaded through <img> still
 * follows the page's colour scheme, so the diagrams match GitHub's theme.
 * Node fills come from each .mmd's classDef and stay the same in both themes,
 * like the app icon's brick tile.
 */
const STYLE = `
  :root {
    --paper:#F5EEE3; --paper-2:#EFE5D7; --ink:#231A15; --ink-2:#6B5D53;
    --rule:#E4D6C5; --brick:#9C3A25; --gold:#B5862C;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper:#161009; --paper-2:#2A1F18; --ink:#F3E9DC; --ink-2:#BBA998;
      --rule:#3A2B22; --brick:#D9704F; --gold:#D7A94C;
    }
  }

  svg { background: var(--paper); }
  .cluster rect { fill: var(--paper-2) !important; stroke: var(--rule) !important; }
  .cluster-label .nodeLabel, .cluster span { fill: var(--ink-2) !important; color: var(--ink-2) !important; }
  .edgeLabel .labelBkg, .edgeLabel rect { fill: var(--paper) !important; }
  .edgeLabel, .edgeLabel * {
    color: var(--ink-2) !important; fill: var(--ink-2) !important;
    background: transparent !important; font-size: 12px !important;
  }
  /* No font-family override here: mermaid sizes each box for the face it
     measured with before this stylesheet is added, so changing the face
     afterwards clips the last line of a label. */

  /* The travelling dash. One rule, every connector. */
  .flowchart-link {
    stroke: var(--brick) !important;
    stroke-width: 1.6px !important;
    stroke-dasharray: 10 8 !important;
    animation: bv-flow 1.15s linear infinite;
  }
  @keyframes bv-flow { from { stroke-dashoffset: 18; } to { stroke-dashoffset: 0; } }
  .arrowMarkerPath { fill: var(--brick) !important; stroke: var(--brick) !important; }

  /* Anyone who has asked their machine for less movement gets a still picture,
     the same rule the site follows. */
  @media (prefers-reduced-motion: reduce) {
    .flowchart-link { animation: none; stroke-dasharray: none !important; }
  }
`;

const files = readdirSync(SRC).filter((f) => f.endsWith(".mmd")).sort();
if (!files.length) throw new Error(`No .mmd files in ${SRC}`);

const work = mkdtempSync(join(tmpdir(), "mmd-"));
const cfg = join(work, "puppeteer.json");
writeFileSync(cfg, JSON.stringify({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }));

for (const file of files) {
  const out = join(SRC, file.replace(/\.mmd$/, ".svg"));
  execFileSync("npx", ["-y", "@mermaid-js/mermaid-cli", "-i", join(SRC, file),
                       "-o", out, "-p", cfg, "-b", "transparent", "-q"],
               { stdio: "inherit" });

  // mermaid emits exactly one <style> block; append to it so its own layout rules survive.
  let svg = readFileSync(out, "utf8");
  const at = svg.indexOf("</style>");
  if (at === -1) throw new Error(`No <style> block in ${out}: mermaid's output has changed`);
  svg = svg.slice(0, at) + STYLE + svg.slice(at);
  writeFileSync(out, svg);
  console.log(`${out}  ${(svg.length / 1024).toFixed(1)} kB`);
}
