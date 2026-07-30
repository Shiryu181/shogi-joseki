import type { JosekiMove } from "../domain/types";
import "./BranchNav.css";

export interface BranchNavProps {
  /** 現在ノードの分岐一覧。 */
  branches: JosekiMove[];
  /** 現在選択中の分岐のインデックス。 */
  activeIndex: number;
  /** 分岐をクリックしたときのコールバック(ノードは移動せず、プレビューを切り替える)。 */
  onSelect: (index: number) => void;
}

const KIND_LABEL: Record<JosekiMove["kind"], string> = {
  main: "本線",
  alt: "変化",
  deviation: "逸れ手",
};

/**
 * 分岐切替バー。DESIGN.md §5.3 の「本線/変化/逸れ手」表示枠。
 * 分岐が本線1本だけ(選べる余地が無い)のときは何も表示しない。
 * 複数の分岐、または本線以外の分岐が1つでもあれば表示し、クリックで選択を切り替えられる。
 */
export function BranchNav({ branches, activeIndex, onSelect }: BranchNavProps) {
  const hasRealChoice = branches.length > 1 || (branches.length === 1 && branches[0].kind !== "main");
  if (!hasRealChoice) return null;

  return (
    <div className="branchbar">
      {branches.map((b, i) => (
        <button
          key={`${b.usi}-${i}`}
          type="button"
          className={`branch${b.kind === "deviation" ? " dev" : ""}${i === activeIndex ? " on" : ""}`}
          onClick={() => onSelect(i)}
          aria-pressed={i === activeIndex}
        >
          {KIND_LABEL[b.kind]}
        </button>
      ))}
    </div>
  );
}
