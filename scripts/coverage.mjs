/**
 * 収録計画(plan.mjs)と実際のコースJSONを突き合わせて、組み合わせ表と空白を表示する。
 *   node scripts/coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STRATEGIES, PAIRINGS } from "./plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "src", "data", "joseki");
const existing = new Map();
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
  let n = 0, node = d.root;
  for (;;) { const m = node.branches.find((b) => b.kind === "main"); if (!m || !m.child) break; node = m.child; n++; }
  existing.set(d.id, { side: d.mySide, moves: n });
}

const covered = new Set();
console.log("組み合わせ表(自分の戦法 × 相手の戦法)。数字は コース数[先手/後手]\n");
console.log("優先  自分         相手                     先手 後手  状態");
for (const p of [...PAIRINGS].sort((a, b) => b.priority - a.priority)) {
  const cs = p.courses.filter((id) => existing.has(id));
  const missing = p.courses.filter((id) => !existing.has(id));
  cs.forEach((id) => covered.add(id));
  const s = cs.filter((id) => existing.get(id).side === "sente").length;
  const g = cs.filter((id) => existing.get(id).side === "gote").length;
  const status = cs.length === 0 ? "◆ 無し" : s === 0 || g === 0 ? "△ 片方の先後のみ" : "○";
  const label = STRATEGIES[p.opp]?.label ?? p.opp;
  console.log(`${String(p.priority).padStart(3)}   ${p.mine.padEnd(10, "　")} ${label.padEnd(12, "　")} ${String(s).padStart(3)} ${String(g).padStart(4)}   ${status}${p.note ? "  ※" + p.note : ""}${missing.length ? "  (計画にあるが未生成: " + missing.join(",") + ")" : ""}`);
}
const orphan = [...existing.keys()].filter((id) => !covered.has(id));
if (orphan.length) console.log("\n計画に載っていないコース:", orphan.join(", "));
console.log(`\nコース ${existing.size} / 組み合わせ ${PAIRINGS.length} / 無し ${PAIRINGS.filter((p) => p.courses.filter((id) => existing.has(id)).length === 0).length}`);
