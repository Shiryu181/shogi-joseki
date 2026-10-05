/**
 * 許容手(accepted)と急所(sharp)の集計を出す開発用スクリプト。
 *
 * 見たいこと:
 *   1. 自分の手のうち何手に許容手が付いたか
 *   2. 許容手の数が「駒組み」と「駒がぶつかった後」でどう違うか
 *      → 駒組みでは差が出ないという前提が、全コースで本当に成り立つかの確認
 *   3. 急所(次善手との差が100点以上)が何手あるか。少なすぎると出題の山場が作れない
 *   4. 定跡手がエンジンの許容手から外れている手(出典とエンジンの食い違い)
 *
 * フェーズの判定は SFEN の持ち駒欄で行う。持ち駒があれば駒の取り合いが
 * 起きているので「駒がぶつかった後」。手数で切るより正確。
 *
 * 使い方: node scripts/accepted-report.mjs [--warn] [--course <id>]
 *   --warn : 定跡手が許容手から外れている手を全部並べる
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const SHOW_WARN = args.includes("--warn");
const ONLY = (() => { const i = args.indexOf("--course"); return i >= 0 ? args[i + 1] : null; })();

const DIR = "src/data/joseki";
const CACHE = "scripts/accepted-cache.json";
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf-8")) : { meta: {}, positions: {} };

/** 持ち駒があれば駒の取り合いが起きている。 */
const phaseOf = (sfen) => (sfen.split(" ")[2] === "-" ? "駒組み" : "ぶつかった後");

const rows = [];       // 自分の手 1つ = 1行
const perCourse = [];

for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const c = JSON.parse(readFileSync(`${DIR}/${f}`, "utf-8"));
  if (ONLY && c.id !== ONLY) continue;
  const myChar = c.mySide === "sente" ? "b" : "w";
  const mine = [];
  let ply = 0;

  const walk = (node, depth) => {
    for (const b of node.branches) {
      if (b.kind === "main" && node.sfen.split(" ")[1] === myChar) {
        mine.push({
          course: c.id, ply: depth + 1, usi: b.usi, note: b.note,
          phase: phaseOf(node.sfen),
          accepted: b.accepted ? b.accepted.length : null,
          sharp: !!b.sharp,
          inAccepted: b.accepted ? b.accepted.includes(b.usi) : null,
        });
      }
      if (b.kind === "main" && b.child) walk(b.child, depth + 1);
    }
  };
  walk(c.root, 0);
  rows.push(...mine);
  perCourse.push({
    id: c.id, title: c.title, total: mine.length,
    annotated: mine.filter((m) => m.accepted !== null).length,
    sharp: mine.filter((m) => m.sharp).length,
    off: mine.filter((m) => m.inAccepted === false).length,
  });
}

const annotated = rows.filter((r) => r.accepted !== null);
const bucket = (n) => (n === 1 ? "1通り" : n <= 3 ? "2〜3通り" : n <= 5 ? "4〜5通り" : n <= 8 ? "6〜8通り" : "9通り以上");
const ORDER = ["1通り", "2〜3通り", "4〜5通り", "6〜8通り", "9通り以上"];

console.log(`キャッシュ: ${Object.keys(cache.positions).length} 局面 (ms=${cache.meta.ms} tol=${cache.meta.tol} ${cache.meta.updated ?? ""})`);
console.log(`自分の手 ${rows.length} / 許容手が付いた手 ${annotated.length} / 未計算 ${rows.length - annotated.length}`);

console.log("\n── 許容手の数(フェーズ別)──");
const phases = ["駒組み", "ぶつかった後"];
const head = ORDER.map((b) => b.padStart(9)).join("");
console.log(`${"".padEnd(14)}${head}${"  計".padStart(6)}`);
for (const ph of phases) {
  const sub = annotated.filter((r) => r.phase === ph);
  const cells = ORDER.map((b) => String(sub.filter((r) => bucket(r.accepted) === b).length).padStart(9)).join("");
  console.log(`${ph.padEnd(12)}${cells}${String(sub.length).padStart(6)}`);
}

console.log("\n── 急所(次善手との差が100点以上)──");
for (const ph of phases) {
  const sub = annotated.filter((r) => r.phase === ph);
  const s = sub.filter((r) => r.sharp).length;
  const pct = sub.length ? Math.round((s / sub.length) * 100) : 0;
  console.log(`${ph.padEnd(12)} ${String(s).padStart(4)} / ${String(sub.length).padStart(4)} 手  (${pct}%)`);
}

const off = annotated.filter((r) => r.inAccepted === false);
console.log(`\n── 定跡手が許容手から外れている手: ${off.length} 件 ──`);
if (off.length > 0) {
  const byCourse = new Map();
  for (const r of off) byCourse.set(r.course, (byCourse.get(r.course) ?? 0) + 1);
  for (const [id, n] of [...byCourse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`   ${String(n).padStart(3)} 件  ${id}`);
  }
  if (SHOW_WARN) {
    console.log("\n   内訳:");
    for (const r of off) console.log(`   ${r.course} ${r.ply}手目 ${r.usi}  ${r.note ?? ""}`);
  } else {
    console.log("   (--warn で全件表示)");
  }
}

console.log("\n── 急所が多いコース ──");
for (const c of perCourse.filter((c) => c.sharp > 0).sort((a, b) => b.sharp - a.sharp).slice(0, 12)) {
  console.log(`   急所 ${String(c.sharp).padStart(2)} / 自分の手 ${String(c.total).padStart(3)}   ${c.title ?? c.id}`);
}
const noSharp = perCourse.filter((c) => c.annotated > 0 && c.sharp === 0);
console.log(`\n   急所がゼロのコース: ${noSharp.length} / ${perCourse.length}`);
