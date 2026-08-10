/**
 * エンジンの評価値は USI の慣例どおり「渡した局面の手番側から見た値」で返ってくる。
 * そのままだと手番によって符号が反転し混乱するため、練習モードでは常に
 * **先手視点**に正規化して表示する(2026-07-31 コーディネーター確認済みの方針)。
 */
import { Color } from "../domain/shogi";
import type { EngineEvaluateResult } from "./types";

export interface SenteViewScore {
  scoreCp: number;
  mate?: number;
}

/** colorToMove = 評価対象局面(sfen)の手番。 */
export function toSenteViewScore(result: EngineEvaluateResult, colorToMove: Color): SenteViewScore {
  const sign = colorToMove === Color.BLACK ? 1 : -1;
  return {
    scoreCp: result.scoreCp * sign,
    mate: result.mate === undefined ? undefined : result.mate * sign,
  };
}

/** 表示用フォーマット。例: "+120" / "-30" / "+詰み3手" / "-詰み5手"。 */
export function formatSenteViewScore(score: SenteViewScore): string {
  if (score.mate !== undefined) {
    const abs = Math.abs(score.mate);
    return score.mate >= 0 ? `+詰み${abs}手` : `-詰み${abs}手`;
  }
  return score.scoreCp > 0 ? `+${score.scoreCp}` : `${score.scoreCp}`;
}
