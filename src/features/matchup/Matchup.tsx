import { useMemo, useState } from "react";
import { courseEntriesFor, courseEntriesForOpponent } from "../../domain/josekiLoader";
import type { CourseEntry } from "../../domain/josekiLoader";
import type { CardItem } from "../home/StrategyCard";
import type { HomeMode } from "../home/Home";
import "./Matchup.css";

export type PracticeMode = "learn" | "practice";

export interface MatchupProps {
  /** どちらの入口から来たか。見出しと並べ方が変わる。 */
  mode: HomeMode;
  item: CardItem;
  onBack: () => void;
  /** 「この設定で始める」。選んだコースidとモードを渡す。 */
  onStart: (courseId: string, mode: PracticeMode) => void;
}

/** 「自分の戦法」: 分類(group)ごとにまとめる。基本の組み方を先頭に。 */
function groupMine(entries: CourseEntry[]): { title: string; items: CourseEntry[] }[] {
  const order = ["基本", "基本の組み方", "基本の攻め", "基本と変化", "基本と受け方"];
  const map = new Map<string, CourseEntry[]>();
  for (const e of entries) {
    const g = e.group ?? "その他";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(e);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([title, items]) => ({ title, items }));
}

/**
 * コース選択画面。
 * 「自分の戦法」から来たときは、その戦法のコースを分類ごとに並べる。
 * 「相手に備える」から来たときは、その相手への対策をおすすめ順に並べる
 * (自分がどの戦法で戦うかがひと目で分かるように、自分の戦法名を添える)。
 */
export function Matchup({ mode, item, onBack, onStart }: MatchupProps) {
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("learn");
  const entries = useMemo(
    () => (mode === "mine" ? courseEntriesFor(item.id) : courseEntriesForOpponent(item.id)),
    [mode, item.id],
  );
  const [courseId, setCourseId] = useState<string>(() => entries[0]?.id ?? "");
  const selected = entries.find((c) => c.id === courseId) ?? entries[0];

  const sections =
    mode === "mine" ? groupMine(entries) : [{ title: "おすすめ順の対策", items: entries }];

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
            <h2>{mode === "mine" ? item.name : `相手が${item.name}`}</h2>
            <div className="as">{mode === "mine" ? "コースを選ぶ" : "対策を選ぶ"}</div>
          </div>
        </div>
        <div className="mbody">
          <div className="vshero">
            <div className="vs">
              {mode === "mine" ? item.name : `vs ${item.name}`}
              <small>{item.description}</small>
            </div>
          </div>

          {sections.map((sec) => (
            <div className="fld" key={sec.title}>
              <h4>{sec.title}</h4>
              <div className="courselist">
                {sec.items.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`opt course${selected?.id === c.id ? " sel" : ""}`}
                    onClick={() => setCourseId(c.id)}
                  >
                    <span className="course-main">
                      <span className="course-label">
                        {mode === "opponent" && <span className="course-rank">{i + 1}</span>}
                        {c.label}
                        <span className="course-kind">{c.sideLabel}</span>
                        {/* 見出しが「対〇〇」のときは相手名が重複するので出さない */}
                        {mode === "mine" && c.opponentLabel !== item.name && !(c.group ?? "").startsWith("対") && (
                          <span className="course-kind">vs {c.opponentLabel}</span>
                        )}
                      </span>
                      <span className="course-summary">{c.summary}</span>
                    </span>
                    {selected?.id === c.id && <span className="chk">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="fld">
            <h4>モード</h4>
            <div className="pair">
              <button
                type="button"
                className={`opt${practiceMode === "learn" ? " sel" : ""}`}
                onClick={() => setPracticeMode("learn")}
              >
                学習(出題) {practiceMode === "learn" && <span className="chk">✓</span>}
              </button>
              <button
                type="button"
                className={`opt${practiceMode === "practice" ? " sel" : ""}`}
                onClick={() => setPracticeMode("practice")}
              >
                練習(自分で指す) {practiceMode === "practice" && <span className="chk">✓</span>}
              </button>
            </div>
          </div>

          <button type="button" className="startbtn" onClick={() => selected && onStart(selected.id, practiceMode)}>
            この設定で始める
          </button>
        </div>
      </div>
    </div>
  );
}
