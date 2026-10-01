/**
 * 「この手を指すとどうなるか」の原因を特定する。
 *
 * 評価値の差だけを見せても「なぜ悪いのか」は分からない。そこでエンジンの読み筋を
 * 最後までたどり、盤の上で実際に起きること(駒をただで取られる・成り込まれる・
 * 取り返せない)を見つけて、その瞬間を指し示す。
 */
import { Color, PieceType, Position, Square, moveFromUSI } from "../../domain/shogi";

/** 駒の価値(だいたいの駒割り)。どの損が一番大きいかを選ぶためだけに使う。 */
const VALUE: Record<string, number> = {
  [PieceType.PAWN]: 1,
  [PieceType.LANCE]: 4,
  [PieceType.KNIGHT]: 4,
  [PieceType.SILVER]: 6,
  [PieceType.GOLD]: 7,
  [PieceType.BISHOP]: 9,
  [PieceType.ROOK]: 11,
  [PieceType.PROM_PAWN]: 7,
  [PieceType.PROM_LANCE]: 7,
  [PieceType.PROM_KNIGHT]: 7,
  [PieceType.PROM_SILVER]: 7,
  [PieceType.HORSE]: 13,
  [PieceType.DRAGON]: 15,
  [PieceType.KING]: 100,
};

const JA: Record<string, string> = {
  [PieceType.PAWN]: "歩",
  [PieceType.LANCE]: "香",
  [PieceType.KNIGHT]: "桂",
  [PieceType.SILVER]: "銀",
  [PieceType.GOLD]: "金",
  [PieceType.BISHOP]: "角",
  [PieceType.ROOK]: "飛車",
  [PieceType.PROM_PAWN]: "と金",
  [PieceType.PROM_LANCE]: "成香",
  [PieceType.PROM_KNIGHT]: "成桂",
  [PieceType.PROM_SILVER]: "成銀",
  [PieceType.HORSE]: "馬",
  [PieceType.DRAGON]: "竜",
  [PieceType.KING]: "玉",
};

export interface TryFrame {
  /** その手を指したあとの局面。 */
  sfen: string;
  /** ▲２四歩 のような表示テキスト。 */
  text: string;
  usi: string;
  /** 自分の手か。 */
  mine: boolean;
  /** この手で相手に取られた自分の駒(あれば)。 */
  lostPiece?: string;
  /** この手が相手の成り込みか。 */
  promoted?: boolean;
}

export interface TryExplain {
  frames: TryFrame[];
  /** 何が悪いのかの説明。見つからなければ null。 */
  cause: string | null;
  /** cause が指している手(frames の添字)。盤をそこまで進めて見せる。 */
  causeIndex: number | null;
}

/**
 * 自分の手を指した直後の局面から読み筋をたどり、各手の内容と「損の原因」を返す。
 *
 * 原因の見つけ方(上から順に、最初に当てはまったものを採用):
 *   1. 相手が自分の駒を取り、こちらが取り返していない(ただ取り)
 *   2. 相手が自分の陣地で成り込んだ
 *   3. どちらも無ければ、取り合いの結果どちらが駒得かで言う
 */
/** 盤で見せる読み筋の長さ。長すぎると読む気をなくすので、要点が分かる範囲で切る。 */
const MAX_PLIES = 8;

export function explainLine(sfenAfterMyMove: string, pv: string[], myColor: Color): TryExplain {
  const pos = new Position();
  pos.resetBySFEN(sfenAfterMyMove);
  const frames: TryFrame[] = [];

  // 取り合いを追うため、「どの升で何を取ったか」を順に記録する。
  const captures: { index: number; square: string; piece: string; byOpponent: boolean }[] = [];

  for (const usi of pv.slice(0, MAX_PLIES)) {
    const info = moveFromUSI(pos, usi);
    if (!info) break;
    const mover = pos.color;
    const mine = mover === myColor;
    const to = info.move.to;
    const captured = to instanceof Square ? pos.board.at(to) : null;
    if (!pos.doMove(info.move)) break;
    const toUsi = to instanceof Square ? to.usi : usi.slice(2, 4);
    if (captured) {
      captures.push({ index: frames.length, square: toUsi, piece: String(captured.type), byOpponent: !mine });
    }
    frames.push({
      sfen: pos.sfen,
      text: info.displayText,
      usi,
      mine,
      lostPiece: captured && !mine ? JA[String(captured.type)] : undefined,
      promoted: !mine && info.move.promote ? true : undefined,
    });
  }

  // 1) ただ取り: 相手が取った升を、こちらがその直後に取り返していない
  let best: { index: number; text: string; value: number } | null = null;
  for (const c of captures) {
    if (!c.byOpponent) continue;
    const recaptured = captures.some((d) => !d.byOpponent && d.square === c.square && d.index === c.index + 1);
    if (recaptured) continue;
    const value = VALUE[c.piece] ?? 0;
    if (value >= 4 && (!best || value > best.value)) {
      best = {
        index: c.index,
        value,
        text: `${frames[c.index].text} で ${JA[c.piece]} を取られ、取り返せません。`,
      };
    }
  }
  if (best) return { frames, cause: best.text, causeIndex: best.index };

  // 2) 成り込み。ただし直後に取り返している場合(角交換など)は損ではないので対象外。
  const promo = frames.findIndex((f, i) => {
    if (!f.promoted) return false;
    const sq = f.usi.slice(2, 4);
    return !captures.some((d) => !d.byOpponent && d.square === sq && d.index === i + 1);
  });
  if (promo >= 0) {
    return {
      frames,
      cause: `${frames[promo].text} と成り込まれます。成駒を作られると、こちらの陣は一気に危なくなります。`,
      causeIndex: promo,
    };
  }

  // 3) 取り合いの結果で言う(駒の損得)
  let mineGain = 0;
  for (const c of captures) mineGain += (c.byOpponent ? -1 : 1) * (VALUE[c.piece] ?? 0);
  if (mineGain <= -4) {
    return { frames, cause: "駒の取り合いになったとき、こちらのほうが損をします。", causeIndex: frames.length - 1 };
  }
  // 4) はっきりした損が無いときも、何が起きるのかは必ず言う(無言にしない)。
  if (frames.length === 0) return { frames, cause: null, causeIndex: null };
  const last = frames[frames.length - 1];
  if (captures.length > 0) {
    return {
      frames,
      cause: `駒の損得は五分ですが、この取り合いのあと ${last.text} まで進み、相手に先に形を作られます。`,
      causeIndex: frames.length - 1,
    };
  }
  return {
    frames,
    cause: `駒を取られるわけではありません。ただし ${last.text} まで進むあいだに相手に手を稼がれ、こちらの駒は働きにくいままです。`,
    causeIndex: frames.length - 1,
  };
}
