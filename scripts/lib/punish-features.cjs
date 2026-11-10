/**
 * 咎めの手順(USI の列)から「盤で見える得」の手がかりを数える部品(段階1の広げた基準用)。
 * 見える得 = 駒得 / 竜・馬を作れる(相手は防げない) / 王手で攻め続けられる。
 * ここでは手がかりだけを機械で数え、「相手は防げない」「王手が続く理由」は人が盤で確かめる。
 *   features(sfen, usiList) → { punisher, mat: 各手のあとの駒得(咎める側から見た差、歩1香3桂3銀5金6角8飛10・成りは同じ)、
 *                               made: 咎める側が竜・馬を作った手の [手番号, "竜"|"馬"]、checks: 咎める側の王手の手番号、
 *                               checkRun: 咎める側の王手が連続した最長手数 }
 * 手番号は usiList の1手目から数える(1手目が咎められる側のミスの手なら、咎める側の手は偶数)。
 */
const { Position, parseUSIMove } = require("tsshogi");
const VAL = { p: 1, l: 3, n: 3, s: 5, g: 6, b: 8, r: 10, k: 0 };
function material(sfen) {
  const [board, , hands] = sfen.split(" ");
  let b = 0, w = 0;
  for (const ch of board) {
    if (ch === "+" || ch === "/" || /\d/.test(ch)) continue;
    const v = VAL[ch.toLowerCase()] ?? 0;
    if (ch === ch.toUpperCase()) b += v; else w += v;
  }
  if (hands && hands !== "-") {
    let n = 0;
    for (const ch of hands) {
      if (/\d/.test(ch)) { n = n * 10 + Number(ch); continue; }
      const v = (VAL[ch.toLowerCase()] ?? 0) * (n || 1); n = 0;
      if (ch === ch.toUpperCase()) b += v; else w += v;
    }
  }
  return { b, w };
}
function features(sfen, usiList) {
  const p = new Position(); p.resetBySFEN(sfen);
  const punisher = p.color === "black" ? "white" : "black"; // 最初に指す側がミスをする側
  const sign = punisher === "black" ? 1 : -1;
  const res = { punisher, mat: [], made: [], checks: [], checkRun: 0, ok: true };
  res.mat0 = (() => { const { b, w } = material(sfen); return sign * (b - w); })();
  let run = 0;
  for (let i = 0; i < usiList.length; i++) {
    const q = parseUSIMove(usiList[i]); if (!q) { res.ok = false; break; }
    let m = p.createMove(q.from, q.to); if (!m) { res.ok = false; break; }
    if (q.promote) m = m.withPromote();
    if (!p.isValidMove(m)) { res.ok = false; break; }
    const mover = p.color;
    const pt = m.pieceType;
    if (!p.doMove(m)) { res.ok = false; break; }
    if (mover === punisher && q.promote && (pt === "rook" || pt === "bishop")) res.made.push([i + 1, pt === "rook" ? "竜" : "馬"]);
    if (mover === punisher) {
      if (p.checked) { res.checks.push(i + 1); run++; res.checkRun = Math.max(res.checkRun, run); } else run = 0;
    }
    const { b, w } = material(p.sfen);
    res.mat.push(sign * (b - w));
  }
  // 終わりの盤に残っている竜(+R)・馬(+B)の数: 咎める側 / ミスをした側
  const board = p.sfen.split(" ")[0];
  const mine = punisher === "black";
  const cnt = { mine: 0, other: 0 };
  for (let i = 0; i < board.length - 1; i++) if (board[i] === "+" && /[rbRB]/.test(board[i + 1])) {
    const isBlack = board[i + 1] === board[i + 1].toUpperCase();
    (isBlack === mine ? cnt.mine : cnt.other)++;
  }
  res.endHorseDragon = cnt;
  res.endSfen = p.sfen;
  return res;
}
module.exports = { features, material };
