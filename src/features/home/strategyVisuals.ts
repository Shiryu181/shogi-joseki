/**
 * 戦法カードの見た目(木肌ヒーローの色・大きな戦法シンボル駒)だけを持つマッピング。
 * 将棋の定石データや戦法マスタ(src/data/strategies.ts)そのものではなく、
 * 純粋に表示用なのでドメイン型(Strategy)には含めていない。
 */
import type { StrategyId } from "../../domain/types";

export interface StrategyVisual {
  /** ヒーロー背景色(mockup.html の wood カラーを踏襲)。 */
  heroColor: string;
  /** 中央に大きく出す戦法シンボル駒の文字(楷書フォント表示)。 */
  glyph: string;
}

const DEFAULT_VISUAL: StrategyVisual = { heroColor: "#E3C07E", glyph: "駒" };

const VISUALS: Record<string, StrategyVisual> = {
  ibisha: { heroColor: "#E7C88A", glyph: "飛" },
  shikenbisha: { heroColor: "#DDB877", glyph: "飛" },
  kakugawari: { heroColor: "#E9D0A0", glyph: "角" },
  nakabisha: { heroColor: "#D8AE6B", glyph: "飛" },
  aigakari: { heroColor: "#EAD3A6", glyph: "飛" },
  yagura: { heroColor: "#D4A863", glyph: "金" },
  sankenbisha: { heroColor: "#E3C07E", glyph: "飛" },
  sujichigaikaku: { heroColor: "#D9B87A", glyph: "角" },
};

export function visualFor(id: StrategyId): StrategyVisual {
  return VISUALS[id] ?? DEFAULT_VISUAL;
}
