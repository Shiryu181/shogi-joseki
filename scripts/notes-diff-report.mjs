// 解説の直しの前後を章ごとに比べて、直した文の数と代表3件の前後を Markdown で出す(読むだけ)。
// 使い方: node scripts/notes-diff-report.mjs <基準のgit ref> <章ID ...>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Position, parseUSIMove, formatMove } from "tsshogi";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ref, ...ids] = process.argv.slice(2);
const kifOf = (sfen, usi) => { try { const p = new Position(); p.resetBySFEN(sfen); const x = parseUSIMove(usi); let mv = p.createMove(x.from, x.to); if (x.promote) mv = mv.withPromote(); return formatMove(p, mv).replace("☗", "▲").replace("☖", "△"); } catch { return usi; } };
const tot = { mine: [0, 0], opp: [0, 0], comment: 0, punish: 0, demo: 0, chap: 0, all: 0 };
const rows = []; const samples = [];
for (const id of ids) {
  const rel = `src/data/joseki/${id}.json`;
  const old = JSON.parse(execFileSync("git", ["show", `${ref}:${rel}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }));
  const cur = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const me = cur.mySide === "sente" ? "b" : "w";
  const c = { mine: [0, 0], opp: [0, 0], comment: 0, punish: 0, demo: 0, chap: 0 }; const ch = [];
  for (const f of ["title", "goalLabel", "goalFormation"]) if (old[f] !== cur[f]) c.chap++;
  if ((old.root.comment ?? "") !== (cur.root.comment ?? "")) c.chap++;
  (function walk(a, b, depth, trail) {
    const turn = b.sfen.split(" ")[1];
    (b.branches ?? []).forEach((y, i) => {
      const x = a.branches[i]; const ply = depth + 1; const mine = turn === me;
      const k = mine ? "mine" : "opp"; c[k][1]++;
      if ((x.note ?? "") !== (y.note ?? "")) { c[k][0]++; if (mine && y.note && x.note) ch.push({ ply, trail, kif: kifOf(b.sfen, y.usi), before: x.note, after: y.note, main: y.kind === "main" && !trail }); }
      if ((x.punishNote ?? "") !== (y.punishNote ?? "")) c.punish++;
      if (JSON.stringify(x.demos ?? []) !== JSON.stringify(y.demos ?? [])) c.demo++;
      if (x.child && y.child) {
        if ((x.child.comment ?? "") !== (y.child.comment ?? "")) c.comment++;
        walk(x.child, y.child, ply, trail + (y.kind === "main" ? "" : `${ply}手目${kifOf(b.sfen, y.usi)}(${y.kind})→`));
      }
    });
  })(old.root, cur.root, 0, "");
  const sum = c.mine[0] + c.opp[0] + c.comment + c.punish + c.demo + c.chap;
  for (const k of ["mine", "opp"]) { tot[k][0] += c[k][0]; tot[k][1] += c[k][1]; }
  for (const k of ["comment", "punish", "demo", "chap"]) tot[k] += c[k]; tot.all += sum;
  rows.push(`| ${id} | ${c.mine[0]}/${c.mine[1]} | ${c.opp[0]} | ${c.comment} | ${c.punish} | ${c.demo} | ${c.chap} | ${sum} |`);
  const main = ch.filter((x) => x.main); const pool = main.length >= 3 ? main : ch;
  const pick = pool.length <= 3 ? pool : [pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]];
  samples.push({ id, pick });
}
console.log("### 章ごとの直した文の数\n\n(自分の手の note は 直した/全部。相手の手の note・局面の解説(comment)・咎め(punishNote)・実演(demos)・章の文(title・goalLabel・goalFormation・rootComment)は直した数。数は前後で文が変わった箇所の数)\n");
console.log("| 章 | 自分の手 | 相手の手 | 局面の解説 | 咎め | 実演 | 章の文 | 合計 |\n|---|---|---|---|---|---|---|---|");
console.log(rows.join("\n"));
console.log(`| 合計 | ${tot.mine[0]}/${tot.mine[1]} | ${tot.opp[0]} | ${tot.comment} | ${tot.punish} | ${tot.demo} | ${tot.chap} | ${tot.all} |\n`);
console.log("### 代表3件ずつの前後(自分の手の note。本線の最初・中ほど・最後に直した手)\n");
for (const s of samples) {
  console.log(`#### ${s.id}\n\n| 手 | 前 | 後 |\n|---|---|---|`);
  for (const p of s.pick) console.log(`| ${p.trail}${p.ply}手目 ${p.kif} | ${p.before.replace(/\|/g, "／").replace(/\n/g, " ")} | ${p.after.replace(/\|/g, "／").replace(/\n/g, " ")} |`);
  console.log("");
}
