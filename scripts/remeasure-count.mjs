// 新エンジンでの測り直しの対象を数える(測定はしない)。結果は docs/remeasure-plan-2026-11.md に反映。
// 使い方: node scripts/remeasure-count.mjs [--json 出力先] 
// 対象: src/domain/josekiLoader.ts の登録で strategyId が gokigen / sankenbisha の章。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Position, parseUSIMove } = require("tsshogi");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = (sfen) => sfen.split(" ").slice(0, 3).join(" ");
const turn = (sfen) => (sfen.split(" ")[1] === "w" ? "gote" : "sente");

// 章の一覧
const src = fs.readFileSync(path.join(root, "src/domain/josekiLoader.ts"), "utf8");
const body = src.slice(src.indexOf("export const COURSE_ENTRIES"));
const entries = [...body.matchAll(/id: "([^"]+)",\s*strategyId: ([^,]+),/g)]
  .map((m) => ({ id: m[1], strategy: m[2].replace(/"/g, "") }))
  .filter((e) => e.strategy === "gokigen" || e.strategy === "sankenbisha");

// 旧エンジンの記録: lab-out/*.json の rows(ply, usi, gap)。局面キー+手 -> gap の一覧
const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const oldLoss = new Map(); // `${key}|${usi}` -> 旧の損の一覧(咎め探索の記録)
const old = new Map(); // `${key}|${usi}` -> number[]
const labDir = path.join(root, "scripts/lab-out");
for (const f of fs.readdirSync(labDir).filter((f) => f.endsWith(".json"))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(labDir, f), "utf8")); } catch { continue; }
  if (!j || !Array.isArray(j.rows) || !Array.isArray(j.usi)) continue;
  const line = j.usi;
  const p = Position.newBySFEN(START);
  let ok = true;
  for (let i = 0; i < line.length && ok; i++) {
    for (const pu of j.punishments || []) {
      if (pu.ply === i + 1) {
        const add1 = (u, l) => { const kk = `${key(p.sfen)}|${u}`; if (!oldLoss.has(kk)) oldLoss.set(kk, []); oldLoss.get(kk).push(l); };
        add1(pu.badUsi, pu.loss);
        for (const a of pu.alts || []) add1(a.badUsi, a.loss);
      }
    }
    const r = j.rows.find((x) => x.ply === i + 1);
    if (r && typeof r.gap === "number" && r.usi === line[i]) {
      const k = `${key(p.sfen)}|${r.usi}`;
      if (!old.has(k)) old.set(k, []);
      old.get(k).push(r.gap);
    }
    const q = parseUSIMove(line[i]);
    let m = q && p.createMove(q.from, q.to);
    if (m && q.promote) m = m.withPromote();
    if (!m || !p.doMove(m)) ok = false;
  }
}

const result = [];
const allPos = { trunkMine: new Map(), trunkOpp: new Map(), dev: new Map(), devMine: new Map(), varMine: new Map(), varOpp: new Map(), unique: new Map(), border: new Map() };
const add = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
const knownSet = new Set(); // 旧の記録がある本線の局面(重複除去)
const flagRe = /唯一/;

for (const e of entries) {
  const course = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${e.id}.json`), "utf8"));
  const me = course.mySide;
  const r = {
    id: e.id, strategy: e.strategy, side: me,
    trunkMine: new Set(), trunkOpp: new Set(), trunkBorder: new Set(), trunkNoRec: 0, trunkMineN: 0, trunkOppN: 0, trunkRecKnown: 0,
    devLossRec: 0, devLossNoRec: 0, devLossNear: [], dev: 0, devPos: new Set(), devMine: new Set(), devOppInside: new Set(),
    vari: 0, varMine: new Set(), varOpp: new Set(),
    uniq: [], // {where, text}
  };
  // 本線 + 分岐を再帰でたどる。ctx: "trunk" | "dev" | "var"
  function walk(node, ctx, onTrunk, depth, parentKey) {
    const t = turn(node.sfen);
    for (const b of node.branches) {
      const mineMove = t === me;
      const k = key(node.sfen);
      const isTrunkMove = onTrunk && b.kind === "main";
      // 唯一
      for (const field of ["note", "aim", "punishNote"]) {
        if (typeof b[field] === "string" && flagRe.test(b[field])) {
          // note/aim は指す前の局面、punishNote(咎めの枝で相手が外れたあとの自分の返し)は外れた後の局面
          const where = field === "punishNote" && b.child ? key(b.child.sfen) : k;
          r.uniq.push({ pos: where, usi: b.usi, field, mine: field === "punishNote" ? true : mineMove, ctx: isTrunkMove ? "trunk" : ctx });
        }
      }
      if (isTrunkMove) {
        if (mineMove) { r.trunkMine.add(k); r.trunkMineN++; } else { r.trunkOpp.add(k); r.trunkOppN++; }
        const g = old.get(`${k}|${b.usi}`);
        if (g) {
          r.trunkRecKnown++; knownSet.add(k);
          if (g.some((x) => x >= 60 && x <= 140)) { r.trunkBorder.add(k); add(allPos.border, k, e.id); }
        } else r.trunkNoRec++;
      } else if (b.kind === "deviation" && !b.variation) {
        // 咎めの枝: 外れる手の局面(相手番)
        r.dev++; r.devPos.add(k);
        const ls = oldLoss.get(`${k}|${b.usi}`);
        if (!ls) r.devLossNoRec++;
        else { r.devLossRec++; if (ls.some((x) => x >= 230 && x <= 330)) { r.devLossNear.push({ pos: k, usi: b.usi, loss: ls }); } }
      } else if (b.kind === "deviation" && b.variation) {
        r.vari++; r.varOpp.add(k); // 変化の入口(相手の別の手を指す局面)
      } else if (ctx !== "trunk" || !onTrunk) {
        // 枝の中の続き
        if (mineMove) { (ctx === "var" ? r.varMine : r.devMine).add(k); }
        else { (ctx === "var" ? r.varOpp : r.devOppInside).add(k); }
      }
      if (b.kind === "alt") { r.alt = (r.alt || 0) + 1; }
      if (b.child) {
        let nctx = ctx, ntrunk = onTrunk && b.kind === "main";
        if (b.kind === "deviation") nctx = b.variation ? "var" : "dev";
        else if (!ntrunk && ctx === "trunk") nctx = "dev"; // alt など
        walk(b.child, nctx, ntrunk, depth + 1, k);
      }
    }
    // 節の comment の唯一
    if (typeof node.comment === "string" && flagRe.test(node.comment)) r.uniq.push({ pos: parentKey || key(node.sfen), field: "comment", mine: t !== me, ctx: "node" });
  }
  walk(course.root, "trunk", true, 0, null);
  result.push(r);
}

// 集計(局面は章をまたいで重複除去)
const U = (sel) => { const s = new Set(); result.forEach((r) => sel(r).forEach((k) => s.add(k))); return s; };
const sets = {
  dev: U((r) => r.devPos),
  devMine: U((r) => r.devMine),
  devOpp: U((r) => r.devOppInside),
  varMine: U((r) => r.varMine),
  varOpp: U((r) => r.varOpp),
  trunkMine: U((r) => r.trunkMine),
  trunkOpp: U((r) => r.trunkOpp),
  border: U((r) => r.trunkBorder),
  uniq: U((r) => r.uniq.map((x) => x.pos)),
};
const union = (...ss) => { const s = new Set(); ss.forEach((x) => x.forEach((k) => s.add(k))); return s; };
const A = union(sets.dev, sets.devMine, sets.devOpp, sets.varMine, sets.varOpp, sets.border, sets.uniq);
const B = union(A, sets.trunkMine, sets.trunkOpp);
const summary = {
  courses: result.length,
  sum: (f) => result.reduce((a, r) => a + f(r), 0),
};
const courseA = (r) => union(r.devPos, r.devMine, r.devOppInside, r.varMine, r.varOpp, r.trunkBorder, new Set(r.uniq.map((x) => x.pos)));
const per = result.map((r) => ({
  A: courseA(r).size, B: union(courseA(r), r.trunkMine, r.trunkOpp).size,
  id: r.id, strategy: r.strategy, side: r.side,
  dev: r.dev, devPos: r.devPos.size, devMine: r.devMine.size, devOpp: r.devOppInside.size,
  vari: r.vari, varMine: r.varMine.size, varOpp: r.varOpp.size,
  trunkMine: r.trunkMine.size, trunkOpp: r.trunkOpp.size, trunkBorder: r.trunkBorder.size,
  trunkNoRec: r.trunkNoRec, devLossNear: r.devLossNear.length, devLossNoRec: r.devLossNoRec, uniq: r.uniq.length, alt: r.alt || 0,
}));
const totals = {
  courses: result.length,
  dev: summary.sum((r) => r.dev), devPosNoDedup: summary.sum((r) => r.devPos.size),
  devMineNoDedup: summary.sum((r) => r.devMine.size), devOppNoDedup: summary.sum((r) => r.devOppInside.size),
  vari: summary.sum((r) => r.vari), varMineNoDedup: summary.sum((r) => r.varMine.size), varOppNoDedup: summary.sum((r) => r.varOpp.size),
  trunkMineNoDedup: summary.sum((r) => r.trunkMine.size), trunkOppNoDedup: summary.sum((r) => r.trunkOpp.size),
  trunkBorderNoDedup: summary.sum((r) => r.trunkBorder.size), trunkNoRec: summary.sum((r) => r.trunkNoRec),
  trunkNoRecKnown: summary.sum((r) => r.trunkRecKnown),
  devLossRec: summary.sum((r) => r.devLossRec), devLossNoRec: summary.sum((r) => r.devLossNoRec), devLossNear: summary.sum((r) => r.devLossNear.length),
  uniq: summary.sum((r) => r.uniq.length),
  uniqMine: summary.sum((r) => r.uniq.filter((x) => x.mine).length),
  unique: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size])),
  A: A.size, B: B.size,
  oldRecords: old.size,
};
const trunkAll = union(sets.trunkMine, sets.trunkOpp);
totals.trunkUniqueAll = trunkAll.size;
totals.trunkUniqueBorder = sets.border.size;
totals.trunkUniqueKnown = knownSet.size;
totals.C = union(A, new Set([...trunkAll].filter((k) => !knownSet.has(k)))).size;
totals.branchMoveUnique = union(sets.devMine, sets.devOpp, sets.varMine, sets.varOpp).size;
totals.branchMoveAlsoTrunk = [...union(sets.devMine, sets.devOpp, sets.varMine, sets.varOpp)].filter((k) => trunkAll.has(k)).length;
totals.uniqOnlyExtra = [...sets.uniq].filter((k) => !union(sets.dev, sets.devMine, sets.devOpp, sets.varMine, sets.varOpp, sets.border).has(k)).length;
totals.trunkUniqueNoRec = trunkAll.size - [...trunkAll].filter((k) => knownSet.has(k)).length;
const out = { totals, per, nearDev: result.flatMap((r) => r.devLossNear.map((x) => ({ course: r.id, ...x }))), uniqHits: result.flatMap((r) => r.uniq.map((x) => ({ course: r.id, ...x }))) };
const ji = process.argv.indexOf("--json");
if (ji >= 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1));
console.log(JSON.stringify(totals, null, 1));
console.table(per);
