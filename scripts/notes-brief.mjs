// 解説の直し用の一覧を作る(読むだけ)。章の全ての手を手数順に、今の文と、自分の手には読み筋(notes-pv.cjs の出力)を添えて出す。
// 使い方: node scripts/notes-brief.mjs <章ID> --pv <pv.json[,pv2.json]>
// 読み筋の値は「自分から見た最善との差」(大きいほど劣る)。画面には数字を書かない。3位以下は探索が浅いことがあり、順位と差は目安。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
const pvPath = process.argv[process.argv.indexOf("--pv") + 1];
const pv = new Map(pvPath.split(",").flatMap((f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; } }).map((r) => [r.id, r]));
const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", id + ".json"), "utf8"));
const sign = c.mySide === "sente" ? 1 : -1; // sente 値 → 自分から見た値
const me = c.mySide === "sente" ? "b" : "w";
import { Position, parseUSIMove, formatMove } from "tsshogi";
const kifOf = (sfen, usi) => { const p = new Position(); p.resetBySFEN(sfen); const x = parseUSIMove(usi); let mv = p.createMove(x.from, x.to); if (x.promote) mv = mv.withPromote(); return formatMove(p, mv).replace("☗", "▲").replace("☖", "△"); };
console.log(`# ${id}  ${c.title}  (自分=${c.mySide === "sente" ? "先手" : "後手"})`);
console.log(`goalLabel: ${c.goalLabel}\ngoalFormation: ${c.goalFormation}\n`);
let n = 0;
(function walk(node, depth, trail) {
  if (depth === 0 && node.comment) console.log(`[rootComment] ${node.comment}\n`);
  const turn = node.sfen.split(" ")[1];
  for (const b of node.branches ?? []) {
    const ply = depth + 1; n++;
    const mine = turn === me;
    const kif = kifOf(node.sfen, b.usi);
    const where = b.kind === "main" ? "本線" : `枝(${b.kind})`;
    console.log(`## ${trail || ""}${ply}手目 ${kif} [${mine ? "自分の手" : "相手の手"}・${where}] usi=${b.usi}`);
    console.log(`sfen(指す前): ${node.sfen}`);
    if (b.note) console.log(`note: ${b.note}`);
    if (b.punishNote) console.log(`punishNote: ${b.punishNote}`);
    for (const d of b.demos ?? []) console.log(`demo「${d.title}」: ${d.text}`);
    if (b.child?.comment) console.log(`局面の解説(comment): ${b.child.comment}`);
    if (mine) {
      const r = pv.get(node.sfen);
      if (r) {
        const vals = r.res.map((x) => ({ ...x, v: x.sente * sign }));
        const best = Math.max(...vals.map((x) => x.v));
        const line = vals.map((x) => `${kifOf(node.sfen, x.usi)}(差${best - x.v})`).join(" / ");
        const played = vals.find((x) => x.usi === b.usi);
        console.log(`読み筋(上位5手、最善との差): ${line}`);
        console.log(`  この手: ${played ? `上位に入る(差${best - played.v})` : "上位5手に入らない"}。最善の読み筋: ${vals.sort((a, b2) => b2.v - a.v)[0].pv}`);
      } else console.log("読み筋: 未測定");
    }
    console.log("");
    if (b.child) walk(b.child, ply, trail + (b.kind === "main" ? "" : `${ply}手目${kif}(${b.kind})→`));
  }
})(c.root, 0, "");
