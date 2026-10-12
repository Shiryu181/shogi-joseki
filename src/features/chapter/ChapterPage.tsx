import { useMemo } from "react";
import { useProgressStore } from "../../store/progressStore";
import { useExamStore } from "../../store/examStore";
import { chapterStat, pathFor, stateWord } from "../../domain/courseProgress";
import type { Side } from "../../domain/courseProgress";
import { toKanjiNumber } from "../../domain/kanjiNumber";
import { Bar, Screen, TopBar } from "../../ui/DojoParts";
import "./ChapterPage.css";

export interface ChapterPageProps {
  strategyId: string;
  side: Side;
  chapterIndex: number;
  onBack: () => void;
  /** 学習画面へ。restart が true なら、この章の1手目から。 */
  onLearn: (restart: boolean) => void;
  /** この章の認定試験を始める。 */
  onExam: () => void;
}

/** 章のページ(確定版モック 07)。章の進み具合と、学習・認定試験への入口。 */
export function ChapterPage({ strategyId, side, chapterIndex, onBack, onLearn, onExam }: ChapterPageProps) {
  const items = useProgressStore((s) => s.items);
  const results = useExamStore((s) => s.results);
  const stat = useMemo(() => {
    const chapter = pathFor(strategyId, side).chapters[chapterIndex];
    return chapter ? chapterStat(chapter, chapterIndex, items, results) : null;
  }, [strategyId, side, chapterIndex, items, results]);

  if (!stat) return null;
  const { entry } = stat.chapter;
  const result = stat.result;

  return (
    <Screen className="chapter-screen">
      <TopBar backLabel="戻る" onBack={onBack} title="章のページ" />
      <div className="dojo-body cp">
        <section className="dojo-panel">
          <div className="cp-no">第{toKanjiNumber(chapterIndex + 1)}章</div>
          <h2 className="cp-name">{entry.label}</h2>
          <div className="cp-state">{stateWord(stat, false)}</div>
          <Bar ratio={stat.total === 0 ? 0 : stat.learned / stat.total} />
          <div className="cp-count">覚えた問題 {stat.learned} / {stat.total}</div>
          <p className="cp-blurb">{entry.summary}</p>
          <button type="button" className="btn-primary full" onClick={() => onLearn(false)}>
            {stat.answered > 0 ? "続きから" : "学習をはじめる"}
          </button>
        </section>

        <section className="dojo-panel">
          <div className="cp-no">認定試験</div>
          {result && (
            <p className="cp-line">{result.passed ? "合格" : "不合格"} 最高{result.best}点</p>
          )}
          {stat.ready ? (
            <button type="button" className="btn-secondary full cp-exam-btn" onClick={onExam}>
              {result ? "もう一度受ける" : "認定試験を受ける"}
            </button>
          ) : (
            <p className="cp-line">
              {stat.answered > 0
                ? `あと${stat.unanswered}問解くと受けられます`
                : `この章の問題を一通り解くと受けられます(あと${stat.unanswered}問)`}
            </p>
          )}
        </section>

        <button type="button" className="btn-secondary full" onClick={() => onLearn(true)}>最初から学ぶ</button>
        <p className="cp-restart-n">覚えた記録はそのまま残ります</p>
      </div>
    </Screen>
  );
}
