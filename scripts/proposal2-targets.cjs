/**
 * 直しの案(第2弾・段階1)の対象を、測り直しの結果(remeasure-A/C)と章の JSON から拾い出す。章のデータは変えない。
 *   node scripts/proposal2-targets.cjs            lab-out/proposal2-targets.json に書き、1行ずつ表示する
 * 対象: 本線の手(学ぶ側・相手)、変化の枝(入口・枝の中の自分の手・相手の手)、咎めの枝の中の自分の手 で、最善との差(loss)が100超のもの。
 * 外すもの: 作戦選びの手(2手目 △5四歩・3手目 ▲7五歩)と、第1弾で直した nakabisha--shote の4手目 △5四歩。
 * 局面が同じ(sfen の手番まで同じ)で手も同じものは、章をまたいで1件にまとめる。
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
const root = path.join(__dirname, "..");
const lab = path.join(__dirname, "lab-out");
const key3 = (sfen) => sfen.split(" ").slice(0, 3).join(" ");
const rd = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const rec = new Map(); // key3 -> {rec, stage}
for (const S of ["A", "C"]) {
  const s1 = rd(path.join(lab, `remeasure-${S}-stage1.jsonl`));
  const s2 = new Map(rd(path.join(lab, `remeasure-${S}-stage2.jsonl`)).map((r) => [r.id, r]));
  for (const r of s1) rec.set(key3(r.sfen), { rec: s2.get(r.id) || r, stage: s2.has(r.id) ? 2 : 1 });
}
function jp(sfen, usi) {
  try {
    const p = Position.newBySFEN(sfen); const q = parseUSIMove(usi);
    let m = q.from ? p.createMove(q.from, q.to) : p.createMove(q.piece, q.to);
    if (q.promote) m = m.withPromote();
    return formatMove(p, m).replace("☗", "▲").replace("☖", "△");
  } catch { return usi; }
}
const START_P2 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w -"; // 2手目の局面
const ISHIDA_P3 = "lnsgkgsnl/1r5b1/pppp1pppp/4p4/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b -"; // placeholder (使わない)
const files = fs.readdirSync(path.join(root, "src/data/joseki")).filter((f) => f.endsWith(".json"));
const out = new Map();
const countSub = (node) => { let n = 0; for (const b of node.branches) { n++; if (b.child) n += countSub(b.child); } return n; };
for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", f), "utf8"));
  // 本線を ply 番号つきで集める
  const mainNodes = []; let cur = c.root, ply = 1;
  while (true) { const mb = cur.branches.find((b) => b.kind === "main"); if (!mb) break; mainNodes.push({ node: cur, ply, mb }); cur = mb.child; ply++; }
  const total = mainNodes.length;
  const learnerTurn = c.mySide === "gote" ? "w" : "b";
  const add = (cat, nodeBefore, ply, b, extra) => {
    const k = key3(nodeBefore.sfen); const r = rec.get(k); if (!r) return;
    const mv = r.rec.moves.find((m) => m.usi === b.usi); if (!mv || mv.loss == null || mv.loss <= 100) return;
    const turn = nodeBefore.sfen.split(" ")[1];
    const role = turn === learnerTurn ? "学ぶ側" : "相手";
    const id = `${k}|${b.usi}|${cat}`;
    const o = out.get(id) || { cat, key: k, usi: b.usi, jp: jp(nodeBefore.sfen, b.usi), role, loss: mv.loss, stage: r.stage, best: r.rec.best, bestJp: jp(nodeBefore.sfen, r.rec.best), bestCp: r.rec.bestCp, top: r.rec.top.slice(0, 5).map((t) => `${jp(nodeBefore.sfen, t.usi)}${t.cp}`), s1loss: (r.stage === 2 ? undefined : mv.loss), sfen: nodeBefore.sfen, where: [] };
    o.where.push({ course: c.id, ply, total, role, ...extra });
    out.set(id, o);
  };
  mainNodes.forEach(({ node, ply, mb }) => {
    const exc = (key3(node.sfen) === START_P2 && mb.usi === "5c5d") || (ply === 3 && mb.usi === "7g7f") || (ply === 3 && mb.usi === "7f7e") || (ply === 4 && c.id === "nakabisha--shote" && mb.usi === "5c5d");
    // 作戦選び: 2手目 △5四歩、3手目 ▲7五歩
    const isSakusen = (ply === 2 && mb.usi === "5c5d") || (ply === 3 && mb.usi === "7g7f" && false) || (ply === 3 && mb.usi === "7f7e") || (c.id === "nakabisha--shote" && ply === 4 && mb.usi === "5c5d");
    if (!isSakusen) add("本線", node, ply, mb, { after: total - ply, subAfter: mainNodes.slice(ply).reduce((s, x) => s + x.node.branches.filter((b) => b.kind !== "main").length, 0) });
    for (const d of node.branches.filter((b) => b.kind === "deviation")) {
      const sak = (ply === 2 && d.usi === "5c5d") || (ply === 3 && d.usi === "7f7e");
      if (!sak || true) add(d.variation ? "変化の入口" : "咎めの入口", node, ply, d, { variation: !!d.variation, sakusen: sak });
      // 枝の中
      let n = d.child, q = ply + 1;
      while (n) { const b = n.branches.find((x) => x.kind === "main"); if (!b) break; add(d.variation ? "変化の枝の中" : "咎めの枝の中", n, q, b, { devPly: ply, devUsi: d.usi, devVariation: !!d.variation, lineLen: (() => { let k = 0, t = d.child; while (t) { const bb = t.branches.find((x) => x.kind === "main"); if (!bb) break; k++; t = bb.child; } return k; })() }); n = b.child; q++; }
    }
  });
}
const arr = [...out.values()].sort((a, b) => (a.cat > b.cat ? 1 : a.cat < b.cat ? -1 : b.loss - a.loss));
fs.writeFileSync(path.join(lab, "proposal2-targets.json"), JSON.stringify(arr, null, 1));
for (const o of arr) console.log(o.cat, o.role, o.jp, "loss", o.loss, "s" + o.stage, "best", o.bestJp, "|", o.where.map((w) => `${w.course}:${w.ply}${w.devPly ? "(枝" + w.devPly + ")" : ""}`).join(" "));
console.log(arr.length);
