/** 咎める側が竜・馬を作った手のあと、相手がその駒をすぐ取れるか(取れる利きの数)を数える。使い方: node scripts/lib/punish-capturable.cjs <sfen> <usi...> */
const { Position, parseUSIMove, Color } = require("tsshogi");
function check(sfen, usiList) {
  const p = new Position(); p.resetBySFEN(sfen);
  const punisher = p.color === "black" ? "white" : "black";
  const out = [];
  usiList.forEach((u, i) => {
    const q = parseUSIMove(u); let m = p.createMove(q.from, q.to); if (q.promote) m = m.withPromote();
    const mover = p.color, pt = m.pieceType;
    p.doMove(m);
    if (mover === punisher && q.promote && (pt === "rook" || pt === "bishop")) {
      const att = p.listAttackers(q.to).filter((x) => true);
      // listAttackers は「その升に利いている駒」を返す。相手(手番側)の駒だけ数える
      const opp = att.filter((s) => { const pc = p.board.at(s); return pc && pc.color === p.color; });
      out.push({ ply: i + 1, to: q.to.usi, piece: pt === "rook" ? "竜" : "馬", opponentAttackers: opp.length });
    }
  });
  return out;
}
module.exports = { check };
if (require.main === module) console.log(JSON.stringify(check(process.argv[2], process.argv.slice(3))));
