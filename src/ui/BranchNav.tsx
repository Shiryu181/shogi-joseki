import type { JosekiMove } from "../domain/types";
import "./BranchNav.css";

export interface BranchNavProps {
  /** 現在ノードの分岐一覧(Phase1データは main 1本のみ・alt/deviationは空)。 */
  branches: JosekiMove[];
  /** 現在たどっている分岐のインデックス(Phase1は常に0)。 */
  activeIndex: number;
}

const KIND_LABEL: Record<JosekiMove["kind"], string> = {
  main: "本線",
  alt: "変化",
  deviation: "逸れ手",
};

/**
 * 分岐切替バー。DESIGN.md §5.3 の「本線/変化/逸れ手」表示枠。
 * Phase1 では型とUI枠だけ用意し、本線のなぞりのみをサポートするため
 * ボタンは非活性(将来 alt/deviation が追加されたら切替可能にする)。
 */
export function BranchNav({ branches, activeIndex }: BranchNavProps) {
  if (branches.length === 0) return null;
  return (
    <div className="branchbar">
      {branches.map((b, i) => (
        <button
          key={`${b.usi}-${i}`}
          type="button"
          className={`branch${b.kind === "deviation" ? " dev" : ""}${i === activeIndex ? " on" : ""}`}
          disabled
        >
          {KIND_LABEL[b.kind]}
        </button>
      ))}
    </div>
  );
}
