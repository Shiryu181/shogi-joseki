// 局面を文字で見る(解説の直しで、駒の位置・利きを盤で確かめる用。読むだけ)。
// 使い方: node scripts/notes-board.mjs "<sfen>" [USI手 ...] [--attack 33 ...]
//   手を渡すと、その手を順に指した後の局面を出す。--attack 升(筋と段の数字2桁。例 33)で、その升に利いている駒を先手・後手別に出す。
import { Position, parseUSIMove, Square } from "tsshogi";
const args = process.argv.slice(2);
const sfen = args.shift();
const attacks = []; const moves = [];
while (args.length) { const a = args.shift(); if (a === "--attack") attacks.push(args.shift()); else moves.push(a); }
const p = new Position(); p.resetBySFEN(sfen);
for (const u of moves) { const x = parseUSIMove(u); let mv = p.createMove(x.from, x.to); if (x.promote) mv = mv.withPromote(); if (!p.isValidMove(mv) || !p.doMove(mv)) { console.log("違法手:", u); process.exit(1); } }
const J = { pawn: "歩", lance: "香", knight: "桂", silver: "銀", gold: "金", bishop: "角", rook: "飛", king: "玉", promPawn: "と", promLance: "杏", promKnight: "圭", promSilver: "全", horse: "馬", dragon: "龍" };
const name = (pc) => (J[pc.type] ?? pc.type);
const mark = (pc) => (pc.color === "black" ? "▲" : "△");
console.log(p.sfen, p.color === "black" ? "(先手番)" : "(後手番)");
console.log("   9    8    7    6    5    4    3    2    1");
for (let rank = 1; rank <= 9; rank++) {
  let line = "";
  for (let file = 9; file >= 1; file--) { const sq = Square.all.find((s) => s.file === file && s.rank === rank); const pc = p.board.at(sq); line += pc ? ` ${mark(pc)}${name(pc)} ` : "  ・ "; }
  console.log(line + "  " + "一二三四五六七八九"[rank - 1]);
}
const hand = (h) => { const out = []; for (const k of ["rook", "bishop", "gold", "silver", "knight", "lance", "pawn"]) { const n = h.count ? h.count(k) : 0; if (n) out.push(J[k] + (n > 1 ? n : "")); } return out.join(" ") || "なし"; };
try { console.log("先手の持ち駒:", hand(p.blackHand), " 後手の持ち駒:", hand(p.whiteHand)); } catch {}
for (const a of attacks) {
  const sq = Square.all.find((s) => s.file === Number(a[0]) && s.rank === Number(a[1]));
  for (const c of ["black", "white"]) {
    const list = p.listAttackers(sq).filter((s) => p.board.at(s).color === c).map((s) => `${s.file}${s.rank}${name(p.board.at(s))}`);
    console.log(`${a}に利く${c === "black" ? "先手" : "後手"}の駒: ${list.join(" ") || "なし"}`);
  }
}
