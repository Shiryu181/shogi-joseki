/**
 * 同じ学習パス(戦法×手番)の章どうしで、「同じ局面なのに正解の手が食い違う」ところを探す検査。
 *
 * 規則: 相手が違う手を指すまで、学習者の手はどの章でも同じでなければならない。
 * 同じ局面で章ごとに別の手が正解だと、学習者はどちらが「正解」か分からない。
 *
 * やること:
 *  1. src/domain/josekiLoader.ts の COURSE_ENTRIES から、学習パスに載っている戦法
 *     (src/domain/courseProgress.ts の READY_STRATEGY_IDS)の章を、(戦法 × 手番) ごとに集める。
 *     アプリの学習パスと同じ分け方。作り込み前の戦法の章は対象にしない。
 *  2. 各章の JSON の本線と全ての枝(咎め・別解)をたどり、学習者の手番の局面ごとに
 *     (局面 = 盤面 + 手番 + 持ち駒) → 正解の手 を集める。
 *  3. 同じ局面で正解の手が章によって違うものを報告する。食い違いがあれば終了コード 1。
 *
 * 使い方: node scripts/check-consistency.mjs
 * `node scripts/courses.mjs` の最後からも呼ばれる(JSON を作り直した直後に検査するため)。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);

/** COURSE_ENTRIES を読み、"戦法/手番" → 章ID の並びを作る。 */
function readPaths() {
  const progress = readFileSync(new URL("src/domain/courseProgress.ts", ROOT), "utf-8");
  const ready = /READY_STRATEGY_IDS\s*=\s*\[([^\]]*)\]/.exec(progress);
  if (!ready) throw new Error("courseProgress.ts に READY_STRATEGY_IDS が見つかりません");
  const readyIds = [...ready[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const src = readFileSync(new URL("src/domain/josekiLoader.ts", ROOT), "utf-8");
  const start = src.indexOf("export const COURSE_ENTRIES");
  if (start < 0) throw new Error("josekiLoader.ts に COURSE_ENTRIES が見つかりません");
  const body = src.slice(start);
  const paths = new Map();
  const re = /id:\s*"([^"]+)",\s*strategyId:\s*(null|"[^"]+"),[\s\S]*?sideLabel:\s*"(先手|後手)"/g;
  let m;
  while ((m = re.exec(body))) {
    const strategyId = m[2].replaceAll('"', "");
    if (!readyIds.includes(strategyId)) continue;
    const key = `${strategyId}/${m[3]}`;
    if (!paths.has(key)) paths.set(key, []);
    paths.get(key).push(m[1]);
  }
  return paths;
}

const posKey = (sfen) => sfen.split(" ").slice(0, 3).join(" ");

/** 1つの章から、学習者の手番の局面 → 正解の手 を集める。 */
function collect(courseId, table) {
  const course = JSON.parse(readFileSync(new URL(`src/data/joseki/${courseId}.json`, ROOT), "utf-8"));
  const learnerTurn = course.mySide === "sente" ? "b" : "w";
  const walk = (node, ply, via) => {
    if (node.sfen.split(" ")[1] === learnerTurn) {
      const key = posKey(node.sfen);
      for (const b of node.branches) {
        // 学習者の手番で正解として出すのは本線(main)の手。
        if (b.kind !== "main") continue;
        if (!table.has(key)) table.set(key, new Map());
        const byMove = table.get(key);
        if (!byMove.has(b.usi)) byMove.set(b.usi, []);
        byMove.get(b.usi).push({ courseId, ply: ply + 1, via });
      }
    }
    for (const b of node.branches) {
      if (b.child) walk(b.child, ply + 1, via === "main" && b.kind === "main" ? "main" : "枝");
    }
  };
  walk(course.root, 0, "main");
}

export function checkConsistency({ quiet = false } = {}) {
  const paths = readPaths();
  const conflicts = [];
  for (const [key, ids] of paths) {
    const table = new Map();
    for (const id of ids) collect(id, table);
    for (const [pos, byMove] of table) {
      if (byMove.size < 2) continue;
      conflicts.push({ path: key, pos, byMove });
    }
  }
  // 手数が浅いものから並べる(一番早く食い違うところが根本)。
  const plyOf = (c) => Math.min(...[...c.byMove.values()].flat().map((x) => x.ply));
  conflicts.sort((a, b) => a.path.localeCompare(b.path) || plyOf(a) - plyOf(b));

  if (!quiet) {
    console.log("\n整合性の検査(同じ局面で章ごとに正解が違わないか):");
    for (const [key, ids] of paths) console.log(`  ${key}: ${ids.length}章`);
    if (conflicts.length === 0) console.log("  ✓ 食い違いはありません");
    else {
      console.log(`\n✗ 食い違い ${conflicts.length} 件:`);
      for (const c of conflicts) {
        console.log(`  [${c.path}] ${plyOf(c)}手目ごろ  ${c.pos}`);
        for (const [usi, who] of c.byMove) {
          const names = who.map((x) => `${x.courseId}(${x.ply}手目${x.via === "main" ? "" : "・枝"})`).join(", ");
          console.log(`      ${usi}: ${names}`);
        }
      }
    }
  }
  return conflicts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const conflicts = checkConsistency();
  process.exit(conflicts.length > 0 ? 1 : 0);
}
