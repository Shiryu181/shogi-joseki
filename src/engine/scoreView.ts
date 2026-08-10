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

/**
 * 評価値の読み方を説明する一言(常に併記する基準文)。数値だけだと初心者には
 * 意味が伝わらないため、符号の向きだけは明示しておく(2026-08 コーディネーター
 * 確認済み: 断定的な良し悪しの判定はここでは行わない)。
 */
export const SENTE_VIEW_BASIS_NOTE =
  "先手視点の評価値の目安です。プラスが大きいほど先手有利、マイナスが大きいほど後手有利になります。";

/**
 * 評価値をざっくりした言葉に変換する(断定を避けた目安表現)。「互角」「やや指し
 * やすい」「指しやすい」「優勢に近い」の4段階。しきい値は一般的な目安の範囲。
 * 「悪手」等、手そのものの良し悪しの断定はしない(あくまで局面の目安)。
 */
export function describeSenteViewScore(score: SenteViewScore): string {
  if (score.mate !== undefined) {
    return score.mate >= 0 ? "先手に詰みの手順があるようです" : "後手に詰みの手順があるようです";
  }
  const abs = Math.abs(score.scoreCp);
  const side = score.scoreCp >= 0 ? "先手" : "後手";
  if (abs < 100) return "ほぼ互角の局面のようです";
  if (abs < 300) return `${side}がやや指しやすい局面のようです`;
  if (abs < 600) return `${side}が指しやすい局面のようです`;
  return `${side}が優勢に近い局面のようです`;
}
