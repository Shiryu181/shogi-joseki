// 測り直し A の範囲(咎め・変化・唯一・境目)の対象局面を一覧にする(測定はしない)。
// 使い方: node scripts/remeasure-cases.mjs   → scripts/lab-out/remeasure-A-cases.json
// 数え方は remeasure-count.mjs と同じ。局面は章をまたいで1回だけ。
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


const flagRe = /唯一/;
const pos = new Map(); // key -> {id, sfen, courses:[{course,ply}], moves: Map(usi -> Set(kind)), kinds:Set}
function addPos(k, sfen, course, ply, kind, usi) {
  if (!pos.has(k)) pos.set(k, { id: k, sfen: k + " 1", courses: [], moves: new Map(), kinds: new Set() });
  const p = pos.get(k);
  if (!p.courses.some((c) => c.course === course.id && c.ply === ply)) p.courses.push({ course: course.id, ply });
  p.kinds.add(kind);
  if (usi) { if (!p.moves.has(usi)) p.moves.set(usi, new Set()); p.moves.get(usi).add(kind); }
}

for (const e of entries) {
  const course = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${e.id}.json`), "utf8"));
  const me = course.mySide;
  function walk(node, ctx, onTrunk, depth, parentKey, parentUsi, parentDepth) {
    const t = turn(node.sfen);
    const kn = key(node.sfen);
    for (const b of node.branches) {
      const mineMove = t === me;
      const k = kn;
      const ply = depth + 1;
      const isTrunkMove = onTrunk && b.kind === "main";
      for (const field of ["note", "aim", "punishNote"]) {
        if (typeof b[field] === "string" && flagRe.test(b[field])) {
          if (field === "punishNote" && b.child) {
            const ck = key(b.child.sfen);
            const replies = b.child.branches.map((x) => x.usi);
            if (!replies.length) addPos(ck, null, e, ply + 1, "唯一(咎めの返し)", null);
            for (const u of replies) addPos(ck, null, e, ply + 1, "唯一(咎めの返し)", u);
          } else addPos(k, null, e, ply, "唯一", b.usi);
        }
      }
      if (isTrunkMove) {
        const g = old.get(`${k}|${b.usi}`);
        if (g && g.some((x) => x >= 60 && x <= 140)) addPos(k, null, e, ply, "境目(本線)", b.usi);
      } else if (b.kind === "deviation" && !b.variation) {
        addPos(k, null, e, ply, "咎めの外れる手", b.usi);
      } else if (b.kind === "deviation" && b.variation) {
        addPos(k, null, e, ply, "変化の入口(相手の別の手)", b.usi);
      } else if (ctx !== "trunk" || !onTrunk) {
        const lab = (ctx === "var" ? "変化の枝の中の" : "咎めの枝の中の") + (mineMove ? "自分の手" : "相手の手");
        addPos(k, null, e, ply, lab, b.usi);
      }
      if (b.child) {
        let nctx = ctx, ntrunk = onTrunk && b.kind === "main";
        if (b.kind === "deviation") nctx = b.variation ? "var" : "dev";
        else if (!ntrunk && ctx === "trunk") nctx = "dev";
        walk(b.child, nctx, ntrunk, depth + 1, k, b.usi, depth);
      }
    }
    if (typeof node.comment === "string" && flagRe.test(node.comment)) {
      addPos(parentKey || kn, null, e, parentKey ? parentDepth + 1 : depth + 1, "唯一(節のコメント)", parentUsi || null);
    }
  }
  walk(course.root, "trunk", true, 0, null, null, 0);
}
const out = [...pos.values()].map((p) => ({
  id: p.id, sfen: p.sfen, kinds: [...p.kinds], courses: p.courses,
  moves: [...p.moves.entries()].map(([usi, ks]) => ({ usi, kinds: [...ks] })),
}));
fs.mkdirSync(labDir, { recursive: true });
fs.writeFileSync(path.join(labDir, "remeasure-A-cases.json"), JSON.stringify(out, null, 1));
const byKind = {};
out.forEach((p) => p.kinds.forEach((k) => (byKind[k] = (byKind[k] || 0) + 1)));
console.log(`対象の局面: ${out.length}`, byKind);
