import { useMemo, useState } from "react";
import { STRATEGIES } from "../../data/strategies";
import { useProgressStore } from "../../store/progressStore";
import { useExamStore } from "../../store/examStore";
import { chapterCounts, pathFor, sideName, stateWord, summarizePath } from "../../domain/courseProgress";
import type { Side } from "../../domain/courseProgress";
import { toKanjiNumber } from "../../domain/kanjiNumber";
import { Bar, ChevronDown, ChevronRight, Screen, TopBar } from "../../ui/DojoParts";
import { SideSheet } from "./SideSheet";
import "./StrategyPage.css";

export interface StrategyPageProps {
  strategyId: string;
  side: Side;
  onBack: () => void;
  onSelectSide: (side: Side) => void;
  onOpenChapter: (index: number) => void;
  onOpenExam: () => void;
}

/** 戦法のページ(確定版モック 04)。手番の切替、正解した問題、章の道、認定試験の入口。 */
export function StrategyPage({ strategyId, side, onBack, onSelectSide, onOpenChapter, onOpenExam }: StrategyPageProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const items = useProgressStore((s) => s.items);
  const results = useExamStore((s) => s.results);
  const strategy = STRATEGIES.find((s) => s.id === strategyId);
  const name = strategy?.name ?? strategyId;

  const sum = useMemo(() => summarizePath(pathFor(strategyId, side).chapters, items, results), [strategyId, side, items, results]);
  const label = `${name}・${sideName(side)}`;

  return (
    <Screen className="strategy-screen">
      <TopBar backLabel="ホーム" onBack={onBack} title={name} />
      <div className="dojo-body">
        <section className="dojo-panel sp-head">
          <button type="button" className="btn-secondary full sp-switch" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
            <span>{label}</span><ChevronDown />
          </button>
          <Bar ratio={sum.total === 0 ? 0 : sum.correct / sum.total} />
          <p className="dj-line sp-count">正解した問題 {sum.correct} / {sum.total}</p>
        </section>

        <h2 className="fuda sp-fuda">章の道</h2>
        <ul className="dojo-panel dj-rows">
          {sum.stats.map((s) => (
            <li key={s.chapter.course.id} className={s.index === sum.currentIndex ? "is-current" : undefined}>
              <button type="button" className="dj-row" onClick={() => onOpenChapter(s.index)}>
                <span className={`chapter-plate${s.state === "passed" ? " chapter-plate--done" : ""}`}>
                  {toKanjiNumber(s.index + 1)}
                </span>
                <span className="dj-row__name">{s.chapter.entry.label}</span>
                <span className="dj-row__state">{stateWord(s, true)}</span>
              </button>
            </li>
          ))}
        </ul>

        <h2 className="fuda sp-fuda">認定試験</h2>
        <button type="button" className="dojo-panel sp-exam" onClick={onOpenExam}>
          <span className="sp-exam__t">{label}　合格 {sum.passed} / {sum.stats.length}章</span>
          <ChevronRight />
        </button>
      </div>

      {sheetOpen && (
        <SideSheet
          strategyId={strategyId}
          side={side}
          total={sum.total}
          counts={chapterCounts(strategyId)}
          onPick={(s) => { onSelectSide(s); setSheetOpen(false); }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </Screen>
  );
}
