/**
 * USI (Universal Shogi Interface) 応答行のパース。
 * 実施済みスパイク(spike/engine-spike.html, 取り込み後は削除)で確認した実際の
 * 出力形式、および @mizarjp/yaneuraou.k-p の README.md の Output Example に基づく。
 *
 * 例:
 *   info depth 12 seldepth 15 score cp 18 nodes 490432 ... pv 7g7f 3c3d ...
 *   info depth 1 seldepth 1 score mate 1 nodes 63 ... pv 1g1f
 *   bestmove 7g7f ponder 3c3d
 *   bestmove resign
 */

export interface ParsedInfoLine {
  scoreCp?: number;
  mate?: number;
  pv?: string[];
}

/** `info ...` 行から `score cp`/`score mate`/`pv` を取り出す。該当情報が無ければ null。 */
export function parseInfoLine(line: string): ParsedInfoLine | null {
  if (!line.startsWith("info ")) return null;
  const tokens = line.trim().split(/\s+/);
  const result: ParsedInfoLine = {};

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "score" && tokens[i + 1] === "cp") {
      const value = Number(tokens[i + 2]);
      if (Number.isFinite(value)) result.scoreCp = value;
      i += 2;
    } else if (tokens[i] === "score" && tokens[i + 1] === "mate") {
      // "score mate N": 手番側が N 手で詰ます(N>0)/詰まされる(N<0)。
      // ごく稀に距離不明で符号のみ("+"/"-")が来る実装もあるが、Number() は
      // それだと NaN になるため mate は付けない(落ちるよりは黙って欠落させる)。
      const value = Number(tokens[i + 2]);
      if (Number.isFinite(value)) result.mate = value;
      i += 2;
    } else if (tokens[i] === "pv") {
      result.pv = tokens.slice(i + 1);
      break; // pv は行の最後に来る
    }
  }

  if (result.scoreCp === undefined && result.mate === undefined && result.pv === undefined) return null;
  return result;
}

export interface ParsedBestmove {
  bestMove: string;
  ponder?: string;
}

/** `bestmove <move> [ponder <move>]` を解析する。`bestmove resign`/`win` も bestMove として素通しする。 */
export function parseBestmoveLine(line: string): ParsedBestmove | null {
  if (!line.startsWith("bestmove ")) return null;
  const tokens = line.trim().split(/\s+/);
  const bestMove = tokens[1];
  if (!bestMove) return null;
  const ponderIndex = tokens.indexOf("ponder");
  const ponder = ponderIndex >= 0 ? tokens[ponderIndex + 1] : undefined;
  return { bestMove, ponder };
}
