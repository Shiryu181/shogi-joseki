// 章ごとの手の一覧(packet)を作る。使い方: node packet.mjs  -> $OUT/<id>.json と summary
import fs from "node:fs";
import path from "node:path";
import { Position, parseUSIMove, formatMove } from "tsshogi";
const root = process.env.REPO ?? "/Users/takahashishiryuu/Desktop/tool/shogi-joseki";
const OUT = process.env.OUT;
const skip = new Set(["nakabisha-vs-chousoku--gote","sankenbisha-gote--aifuri-mukai","nakabisha-vs-5yonfu--kakukoukan","nakabisha-vs-sankenbisha--aifuri","sankenbisha-ishida--aifuri","sankenbisha-gote--migishiken"]);
const entries = fs.readFileSync(path.join(root,"src/domain/josekiLoader.ts"),"utf8");
const body = entries.slice(entries.indexOf("export const COURSE_ENTRIES"));
const ids = [...body.matchAll(/id: "([^"]+)",\s*strategyId: ([^,]+),/g)].filter(m=>/gokigen|sankenbisha/.test(m[2]) || m[1]==="sankenbisha-vs-nakabisha--aifuri").map(m=>m[1]).filter(i=>!skip.has(i));
const DIFF = /最善|同じくらい|ほぼ同じ|劣る|劣り|唯一|より良い|わずか|はっきり|ほかの手|別の手|ほかでも|差が|損/;
const GUESS = /推測|確かめ|出典|狙い|一般的な説明|見つかっ/;
const split = (t)=> (t.match(/[^。!?!?]+[。!?!?]?/g) ?? []).map(s=>s.trim()).filter(Boolean);
const REASON = /ので|から|ため|ように|ことで|れば|ても|と、|ない|ます。.+ます。/;
const all = {};
for (const id of ids) {
  const c = JSON.parse(fs.readFileSync(path.join(root,"src/data/joseki",id+".json"),"utf8"));
  const me = c.mySide==="sente"?"b":"w";
  const moves = [];
  (function walk(node, ply, trail){
    const turn = node.sfen.split(" ")[1];
    for (const b of node.branches ?? []) {
      const p = new Position(); p.resetBySFEN(node.sfen);
      const pu = parseUSIMove(b.usi); let kif = b.usi;
      try { let mv = p.createMove(pu.from, pu.to); if (pu.promote) mv = mv.withPromote(); kif = formatMove(p, mv); } catch {}
      const mine = turn===me;
      const note = b.note ?? "";
      const ss = split(note);
      const flags = [];
      if (mine) { if (DIFF.test(note)) flags.push("diff"); if (GUESS.test(note)) flags.push("guess"); if (ss.length<=1 && !REASON.test(note)) flags.push("noreason"); }
      moves.push({ ply:ply+1, trail, kind:b.kind, mine, usi:b.usi, kif, sfenBefore: node.sfen, note, hasAim:!!b.aim, punishNote:b.punishNote??null, childComment: b.child?.comment ?? null, demos:(b.demos??[]).map(d=>({title:d.title,text:d.text})), flags });
      if (b.child) walk(b.child, ply+1, trail + (b.kind==="main"?"":`${ply+1}手目${b.kif??b.usi}[${b.kind}]→`));
    }
  })(c.root, 0, "");
  all[id] = { id, title:c.title, mySide:c.mySide, goalLabel:c.goalLabel, moves };
}
if (OUT) { fs.mkdirSync(OUT,{recursive:true}); for (const [id,v] of Object.entries(all)) fs.writeFileSync(path.join(OUT,id+".json"), JSON.stringify(v,null,1)); }
let tm=0,tf=0; const uniq=new Set();
for (const [id,v] of Object.entries(all)) { const mine=v.moves.filter(x=>x.mine); const fl=mine.filter(x=>x.flags.length); fl.forEach(x=>uniq.add(x.sfenBefore.split(" ").slice(0,3).join(" "))); tm+=mine.length; tf+=fl.length; console.log(id.padEnd(46), "mine",mine.length,"flag",fl.length,"diff",mine.filter(x=>x.flags.includes("diff")).length,"guess",mine.filter(x=>x.flags.includes("guess")).length,"norsn",mine.filter(x=>x.flags.includes("noreason")).length); }
console.log(ids.length,"chapters; mine",tm,"flag",tf,"uniq positions flagged",uniq.size);
