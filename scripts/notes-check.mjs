// 画面の文の決まり違反を探す(解説の直し用。読むだけ)。
// 使い方: node scripts/notes-check.mjs [章ID ...]   省略すると iPhone 版の全章。違反があれば一覧を出して終了コード1。
//  禁止: 調べる側の話(見つかって・推測です・確かめて・調べて・測って・測定・読み筋)、エンジン、出典、この講座、ほぼ互角、やや
//  警告: note の1〜2文目に手の差の言葉(同じくらい・最善に近い・少し劣る・わずかに…)が入っている(3文目以降へ)。1〜2文が75字超。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEntries, screenTexts } from "./count-screen-numbers.mjs";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBID = /見つかっ|推測です|確かめて|確かめま|調べて|調べま|測って|測定|読み筋|エンジン|出典|この講座|ほぼ互角|やや|(?:推測|狙い)は.{0,6}ません/;
const DIFFWORD = /同じくらい|最善に近|少し劣|わずかに|ほかの手より少し|より少し良い/;
const split = (t) => (t.match(/[^。!?!?]+[。!?!?]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
let ids = process.argv.slice(2);
const extra = ["sankenbisha-vs-nakabisha--aifuri"];
if (!ids.length) ids = [...listEntries().map((e) => e.id), ...extra.filter((i) => !listEntries().some((e) => e.id === i))];
let bad = 0, warn = 0;
for (const id of ids) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", id + ".json"), "utf8"));
  for (const t of screenTexts(c)) {
    if (FORBID.test(t.text)) { bad++; console.log(`禁止 ${id} ${t.trail ?? ""}${t.ply}手目 ${t.where}: ${t.text.slice(0, 80)}`); }
    if (t.where.startsWith("note")) {
      const ss = split(t.text);
      if (ss.slice(0, 2).some((s) => DIFFWORD.test(s))) { warn++; console.log(`警告(手の差が1〜2文目) ${id} ${t.trail ?? ""}${t.ply}手目: ${t.text.slice(0, 70)}`); }
      if (ss.slice(0, 2).join("").length > 75) { warn++; console.log(`警告(1〜2文が長い) ${id} ${t.trail ?? ""}${t.ply}手目: ${ss.slice(0, 2).join("").length}字`); }
    }
  }
}
console.log(`禁止 ${bad} 件、警告 ${warn} 件`);
process.exit(bad ? 1 : 0);
