import { useMemo, useState } from "react";
import type { Strategy } from "../../domain/types";
import { courseEntriesFor } from "../../domain/josekiLoader";
import "./Matchup.css";

export type PracticeMode = "learn" | "practice";

export interface MatchupProps {
  strategy: Strategy;
  onBack: () => void;
  /** 「この設定で始める」。選んだ作戦(コースid)とモードを渡す。 */
  onStart: (courseId: string, mode: PracticeMode) => void;
}

/**
 * 対抗形・条件選択画面。DESIGN.md §5.2 準拠。
 * 実データがあるのは「(居飛車) vs 四間飛車・先手」の1コースのみなので、
 * それ以外の相手戦法・後手は選べないことを明示し(準備中・非活性)、
 * 選べるように見せない。
 */
export function Matchup({ strategy, onBack, onStart }: MatchupProps) {
  const [mode, setMode] = useState<PracticeMode>("learn");
  // この戦法カードから選べるコースだけに絞る(居飛車のカードに四間飛車の作戦が出ないように)。
  const entries = useMemo(() => courseEntriesFor(strategy.id), [strategy.id]);

  // 「相手の戦法 → 自分の手番 → 作戦」の順に絞り込む。
  // 以前は相手と手番を選択中のコースから逆算していたため、相手が四間飛車なのに
  // 作戦一覧に「対三間飛車」が並ぶ、という食い違いが起きていた。
  const opponents = useMemo(
    () => Array.from(new Set(entries.map((c) => c.opponentLabel))),
    [entries],
  );
  const [opponent, setOpponent] = useState<string>(() => entries[0]?.opponentLabel ?? "");
  const [side, setSide] = useState<"先手" | "後手">(() => entries[0]?.sideLabel ?? "先手");
  const [courseId, setCourseId] = useState<string>(() => entries[0]?.id ?? "");

  // 選択の組み合わせが無くなった場合(相手を変えてその手番が無い等)は、
  // state を書き換えずに実際に選べる値へ寄せる。表示と中身が食い違わないようにする。
  const effectiveOpponent = opponents.includes(opponent) ? opponent : (opponents[0] ?? "");
  const byOpponent = entries.filter((c) => c.opponentLabel === effectiveOpponent);
  const availableSides = Array.from(new Set(byOpponent.map((c) => c.sideLabel)));
  const effectiveSide = availableSides.includes(side) ? side : (availableSides[0] ?? "先手");
  const sideEntries = byOpponent.filter((c) => c.sideLabel === effectiveSide);
  const selected = sideEntries.find((c) => c.id === courseId) ?? sideEntries[0];

  /** 相手の戦法を切り替える。手番と作戦も、その相手で選べるものへ寄せ直す。 */
  function chooseOpponent(next: string) {
    setOpponent(next);
    const list = entries.filter((c) => c.opponentLabel === next);
    const keepSide = list.some((c) => c.sideLabel === side);
    const first = keepSide ? list.find((c) => c.sideLabel === side) : list[0];
    if (first) {
      setSide(first.sideLabel);
      setCourseId(first.id);
    }
  }

  /** 手番を切り替えたら、その手番の先頭コースを選び直す。 */
  function chooseSide(next: "先手" | "後手") {
    if (!availableSides.includes(next)) return;
    setSide(next);
    const first = byOpponent.find((c) => c.sideLabel === next);
    if (first) setCourseId(first.id);
  }

  return (
    <div className="matchup-wrap">
      <div className="matchup-frame">
        <div className="abar">
          <button type="button" className="back" onClick={onBack} aria-label="戻る">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <h2>{strategy.name}</h2>
            <div className="as">対戦条件を選ぶ</div>
          </div>
        </div>
        <div className="mbody">
          <div className="vshero">
            <div className="vs">
              {strategy.name} <small>vs {effectiveOpponent || "—"}</small>
            </div>
          </div>

          <div className="fld">
            <h4>相手の戦法</h4>
            {opponents.map((o) => (
              <button
                key={o}
                type="button"
                className={`opt${effectiveOpponent === o ? " sel" : ""}`}
                onClick={() => chooseOpponent(o)}
              >
                {o} {effectiveOpponent === o && <span className="chk">✓</span>}
              </button>
            ))}
            <div className="opt disabled">
              その他の戦法 <span className="mini">準備中</span>
            </div>
          </div>

          <div className="fld">
            <h4>作戦</h4>
            <div className="courselist">
              {sideEntries.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`opt course${selected?.id === c.id ? " sel" : ""}`}
                  onClick={() => setCourseId(c.id)}
                >
                  <span className="course-main">
                    <span className="course-label">
                      {c.label}
                      <span className="course-kind">{c.kind}</span>
                    </span>
                    <span className="course-summary">{c.summary}</span>
                  </span>
                  {selected?.id === c.id && <span className="chk">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="fld">
            <h4>自分の手番</h4>
            <div className="pair">
              {(["先手", "後手"] as const).map((s) => {
                const label = s === "先手" ? "▲ 先手" : "△ 後手";
                if (!availableSides.includes(s)) {
                  return (
                    <div key={s} className="opt disabled">
                      {label} <span className="mini">準備中</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={s}
                    type="button"
                    className={`opt${effectiveSide === s ? " sel" : ""}`}
                    onClick={() => chooseSide(s)}
                  >
                    {label} {effectiveSide === s && <span className="chk">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="fld">
            <h4>モード</h4>
            <div className="pair">
              <button type="button" className={`opt${mode === "learn" ? " sel" : ""}`} onClick={() => setMode("learn")}>
                学習(なぞる) {mode === "learn" && <span className="chk">✓</span>}
              </button>
              <button
                type="button"
                className={`opt${mode === "practice" ? " sel" : ""}`}
                onClick={() => setMode("practice")}
              >
                練習(自分で指す) {mode === "practice" && <span className="chk">✓</span>}
              </button>
            </div>
          </div>

          <button type="button" className="startbtn" onClick={() => selected && onStart(selected.id, mode)}>
            この設定で始める
          </button>
        </div>
      </div>
    </div>
  );
}
