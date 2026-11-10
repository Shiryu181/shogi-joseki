// 測り直し D(境目の測り直し)の対象を拾う。測定はしない。
// 使い方: node scripts/remeasure-D-pick.mjs  → scripts/lab-out/remeasure-D-cases.json (境目に近い順)
// 今の章データ(src/data/joseki)の全局面・全手を歩き、これまでの新エンジンの記録
// (remeasure-A/C の stage1・stage2、proposal2-cache)で境目に入るものを拾う。
//   咎めの外れる手: 損250〜350 / ほかの手: 損60〜140 / 最善の手: 次善との差60〜140(「唯一」の有無に関わらず)
//   第2弾の差し替えで測った局面(proposal2-cache)は、最善と次善の差60〜140なら入れる。
// 作戦選びの例外(「より良い手(…)もありますが」を持つ手)は除く。1局面1回、境目に近い順。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lab = path.join(root, "scripts/lab-out");
const key = (s) => s.split(" ").slice(0, 3).join(" ");
const turn = (s) => (s.split(" ")[1] === "w" ? "gote" : "sente");
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);

// 記録: key -> {rec, stage}(4000万の記録を優先)
const recs = new Map();
for (const [f, st] of [["remeasure-A-stage1", 1], ["remeasure-C-stage1", 1], ["remeasure-A-stage2", 2], ["remeasure-C-stage2", 2]])
  for (const r of readJsonl(path.join(lab, f + ".jsonl"))) { const o = recs.get(r.id); if (!o || st >= o.stage) recs.set(r.id, { rec: r, stage: st }); }
const cache = new Map();
for (const r of readJsonl(path.join(lab, "proposal2-cache.jsonl"))) if (r.top && r.top.length >= 2) cache.set(r.key, r);

function lossMargin(k, usi) {
  const o = recs.get(k); if (!o) return null;
  const r = o.rec;
  const m = r.moves.find((x) => x.usi === usi);
  if (m && m.loss != null) return { loss: m.loss, margin: m.margin, stage: o.stage };
  const i = r.top.findIndex((x) => x.usi === usi);
  if (i >= 0) return { loss: r.top[0].cp - r.top[i].cp, margin: i === 0 && r.top[1] ? r.top[0].cp - r.top[1].cp : null, stage: o.stage };
  return null;
}

const src = fs.readFileSync(path.join(root, "src/domain/josekiLoader.ts"), "utf8");
const body = src.slice(src.indexOf("export const COURSE_ENTRIES"));
const ids = [...body.matchAll(/id: "([^"]+)",\s*strategyId: ([^,]+),/g)].map((m) => m[1]);
const exRe = /より良い手\(.*?\)もありますが/;
const pos = new Map(); // key -> {courses, moves: Map(usi -> {kinds:Set, ex, uniq})}
function add(k, sfen, cid, ply, kind, usi, ex, uniq) {
  if (!pos.has(k)) pos.set(k, { sfen: k + " 1", courses: [], moves: new Map() });
  const p = pos.get(k);
  if (!p.courses.some((c) => c.course === cid && c.ply === ply)) p.courses.push({ course: cid, ply });
  if (!usi) return;
  if (!p.moves.has(usi)) p.moves.set(usi, { kinds: new Set(), ex: false, uniq: false });
  const m = p.moves.get(usi); m.kinds.add(kind); m.ex ||= ex; m.uniq ||= uniq;
}
for (const id of ids) {
  const course = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${id}.json`), "utf8"));
  const walk = (node, depth, ctxPunish) => {
    const k = key(node.sfen);
    for (const b of node.branches) {
      const ex = [b.note, b.aim, b.punishNote].some((t) => typeof t === "string" && exRe.test(t)) || (typeof node.comment === "string" && exRe.test(node.comment) && b.kind === "main");
      const uniq = [b.note, b.aim].some((t) => typeof t === "string" && /唯一/.test(t));
      const kind = b.kind === "deviation" && !b.variation ? "咎めの外れる手" : b.kind === "main" ? "本線" : "変化";
      add(k, node.sfen, id, depth + 1, kind, b.usi, ex, uniq);
      if (b.child) walk(b.child, depth + 1);
    }
  };
  walk(course.root, 0);
}

const out = []; const stats = { total: pos.size, noRecord: 0, 咎め: 0, 損60_140: 0, 差60_140: 0, 第2弾: 0, 例外のみ: 0 };
for (const [k, p] of pos) {
  const reasons = []; let dist = Infinity;
  const have = recs.get(k);
  for (const [usi, m] of p.moves) {
    const lm = lossMargin(k, usi);
    if (!lm) continue;
    const punish = m.kinds.has("咎めの外れる手");
    const other = [...m.kinds].some((x) => x !== "咎めの外れる手");
    if (m.ex) continue;
    if (punish) { if (lm.loss >= 250 && lm.loss <= 350) { reasons.push(["咎め", usi, lm.loss]); dist = Math.min(dist, Math.abs(lm.loss - 300)); } }
    if (other || !punish) {
      if (lm.loss >= 60 && lm.loss <= 140) { reasons.push([m.uniq ? "唯一(最善でない)" : "100以内", usi, lm.loss]); dist = Math.min(dist, Math.abs(lm.loss - 100)); }
      if (lm.loss === 0 && lm.margin != null && lm.margin >= 60 && lm.margin <= 140) { reasons.push([m.uniq ? "唯一" : "次善との差", usi, lm.margin]); dist = Math.min(dist, Math.abs(lm.margin - 100)); }
    }
  }
  if (!have && cache.has(k)) {
    const c = cache.get(k); const d = c.top[0].cp - c.top[1].cp;
    if (d >= 60 && d <= 140) { reasons.push(["第2弾(手の指定なし)", "", d]); dist = Math.min(dist, Math.abs(d - 100)); }
  }
  if (!have && !cache.has(k)) stats.noRecord++;
  if (!reasons.length) continue;
  for (const r of reasons) { if (r[0] === "咎め") stats.咎め++; else if (r[0].startsWith("100以内") || r[0].includes("最善でない")) stats.損60_140++; else if (r[0].startsWith("第2弾")) stats.第2弾++; else stats.差60_140++; }
  out.push({ id: k, sfen: p.sfen, kinds: [...new Set(reasons.map((r) => r[0]))], reasons, dist, courses: p.courses,
    moves: [...p.moves.entries()].map(([usi, m]) => ({ usi, kinds: [...m.kinds] })) });
}
out.sort((a, b) => a.dist - b.dist);
fs.writeFileSync(path.join(lab, "remeasure-D-cases.json"), JSON.stringify(out, null, 1));
console.log(`局面 ${out.length} / 章データ全体 ${stats.total}(記録なし ${stats.noRecord})`, stats);
console.log("距離の分布(0〜5/〜10/〜20/〜40):", [5, 10, 20, 40].map((t) => out.filter((o) => o.dist <= t).length));
