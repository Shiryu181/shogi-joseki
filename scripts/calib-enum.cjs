/**
 * 基準の換算測定(docs/engine-calibration-2026-11.md)用に、章のJSONから候補局面を列挙する。
 * 出力: scripts/lab-out/calib-candidates.json  [{id,kind,course,family,ply,sfen,move,note}]
 *   kind: punish(逸れ手) / unique(noteに「唯一」) / learner(学ぶ側の本線) / opp(相手の本線)
 *   family: gokigen(nakabisha-*) / sanken(sankenbisha-*)
 */
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "..", "src", "data", "joseki");
const out = [];
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  const id = f.replace(/\.json$/, "");
  const family = id.startsWith("nakabisha") ? "gokigen" : id.startsWith("sankenbisha") ? "sanken" : null;
  if (!family) continue;
  const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
  (function walk(n, ply) {
    const stm = n.sfen.split(" ")[1] === "w" ? "gote" : "sente";
    for (const b of n.branches) {
      const base = { id: `${id}#${ply}${b.usi}`, course: id, family, ply, sfen: n.sfen, move: b.usi };
      if (b.kind === "deviation" && !b.variation && b.child) out.push({ ...base, kind: "punish" });
      else if (b.kind === "main") {
        if (/唯一の手です|が唯一の手/.test(b.note || "") && !/唯一ではありません|唯一とは|唯一の手とは|唯一の手ではありません/.test(b.note || "")) out.push({ ...base, kind: "unique", note: b.note });
        out.push({ ...base, kind: stm === c.mySide ? "learner" : "opp" });
      }
      if (b.child) walk(b.child, ply + 1);
    }
  })(c.root, 1);
}
fs.writeFileSync(path.join(__dirname, "lab-out", "calib-candidates.json"), JSON.stringify(out, null, 1));
const cnt = {}; for (const o of out) cnt[o.family + "/" + o.kind] = (cnt[o.family + "/" + o.kind] || 0) + 1;
console.log(cnt);
