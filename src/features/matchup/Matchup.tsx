import { useState } from "react";
import type { Strategy } from "../../domain/types";
import { COURSE_ENTRIES } from "../../domain/josekiLoader";
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
  const [courseId, setCourseId] = useState<string>(COURSE_ENTRIES[0].id);

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
              {strategy.name} <small>vs 四間飛車</small>
            </div>
          </div>

          <div className="fld">
            <h4>相手の戦法</h4>
            <div className="opt sel">
              四間飛車 <span className="chk">✓</span>
            </div>
            <div className="opt disabled">
              中飛車 <span className="mini">準備中</span>
            </div>
            <div className="opt disabled">
              三間飛車 <span className="mini">準備中</span>
            </div>
          </div>

          <div className="fld">
            <h4>作戦</h4>
            <div className="courselist">
              {COURSE_ENTRIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`opt course${courseId === c.id ? " sel" : ""}`}
                  onClick={() => setCourseId(c.id)}
                >
                  <span className="course-main">
                    <span className="course-label">
                      {c.label}
                      <span className="course-kind">{c.kind}</span>
                    </span>
                    <span className="course-summary">{c.summary}</span>
                  </span>
                  {courseId === c.id && <span className="chk">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="fld">
            <h4>自分の手番</h4>
            <div className="pair">
              <div className="opt sel">
                ▲ 先手 <span className="chk">✓</span>
              </div>
              <div className="opt disabled">
                △ 後手 <span className="mini">準備中</span>
              </div>
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

          <button type="button" className="startbtn" onClick={() => onStart(courseId, mode)}>
            この設定で始める
          </button>
        </div>
      </div>
    </div>
  );
}
