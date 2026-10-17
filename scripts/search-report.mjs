// Home search report from the server log. Paste or pipe Railway logs in:
//   railway logs --since 14d | node scripts/search-report.mjs
// Prints the no-match rate and the most common searches that found nothing (lines come from app/api/search-log).
import { readFileSync } from "node:fs";

const lines = readFileSync(0, "utf8").split("\n");
let hits = 0;
const misses = new Map();
for (const raw of lines) {
  const at = raw.indexOf('{"event":"home_search"');
  if (at < 0) continue;
  let e;
  try {
    e = JSON.parse(raw.slice(at, raw.lastIndexOf("}") + 1));
  } catch {
    continue;
  }
  if (e.matched) hits++;
  else misses.set(e.q, (misses.get(e.q) ?? 0) + 1);
}
const missed = [...misses.values()].reduce((a, b) => a + b, 0);
const total = hits + missed;
console.log(`searches: ${total}  matched: ${hits}  no match: ${missed}  no-match rate: ${total ? ((missed / total) * 100).toFixed(1) : "–"}%`);
for (const [q, n] of [...misses].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${String(n).padStart(4)}  ${q}`);
