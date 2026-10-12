import { useMemo } from "react";
import { useProgressStore } from "../../store/progressStore";
import { useExamStore } from "../../store/examStore";
import { useLearningStore } from "../../store/learningStore";
import {
  readyStrategies, blurbOf, chapterCounts, pathFor, summarizePath, dueToday, pickSide, sideName,
} from "../../domain/courseProgress";
import type { Side } from "../../domain/courseProgress";
import type { PathChapter } from "../../domain/josekiLoader";
import { toKanjiNumber } from "../../domain/kanjiNumber";
import { Bar, ChevronRight, GearIcon, PieceIcon, Screen } from "../../ui/DojoParts";
import "./Home.css";

export interface HomeProps {
  /** 今日の復習の対象にする全章(準備ができた戦法の先手・後手すべて)。 */
  allChapters: PathChapter[];
  onReview: () => void;
  onSettings: () => void;
  onAbout: () => void;
  /** 戦法のページを開く。戦法と手番は呼び出し側で学習中として保存する。 */
  onOpenStrategy: (strategyId: string, side: Side) => void;
  /** 学習中の戦法の、いま取り組む章から学習を再開する。 */
  onContinue: (chapterIndex: number) => void;
}

/**
 * ホーム。毎日ここから始める画面。
 * 並びは「今日の復習 → 学習を続ける → 戦法をえらぶ → このアプリについて」。
 * 主ボタンは画面に1つだけ。復習があれば「はじめる」、無ければ「続きから」、
 * 記録がまだ無ければ戦法カードの「この戦法で学ぶ」。
 */
export function Home({ allChapters, onReview, onSettings, onAbout, onOpenStrategy, onContinue }: HomeProps) {
  const items = useProgressStore((s) => s.items);
  const results = useExamStore((s) => s.results);
  const learningId = useLearningStore((s) => s.strategyId);
  const learningSide = useLearningStore((s) => s.side);

  const strategies = useMemo(() => readyStrategies(), []);
  const started = Object.keys(items).length > 0;
  const learning = strategies.find((s) => s.id === learningId) ?? strategies[0];

  const due = useMemo(() => dueToday(allChapters, items), [allChapters, items]);
  const shown = due.shown;
  const shownSharp = due.sharp;

  const sum = useMemo(
    () => (learning ? summarizePath(pathFor(learning.id, learningSide).chapters, items, results) : null),
    [learning, learningSide, items, results],
  );

  const hasReview = shown > 0;
  const next = sum && sum.currentIndex >= 0 ? sum.stats[sum.currentIndex] : null;

  return (
    <Screen className="home-screen">
      <header className="home-band">
        <h1>定跡道場</h1>
        <button type="button" className="btn-secondary home-gear" onClick={onSettings}>
          <GearIcon />設定
        </button>
      </header>

      <div className="home-body">
        <div className="home-sec">
          <h2 className="fuda">今日の復習</h2>
          <section className="dojo-panel">
            {hasReview ? (
              <>
                <div className="home-rv">
                  <span className="home-big">{shown}<span className="home-unit">問</span></span>
                  <button type="button" className="btn-primary home-rv-btn" onClick={onReview}>はじめる</button>
                </div>
                <p className="dj-note home-rv-n">うち急所{shownSharp}問 ・ すべての戦法から</p>
              </>
            ) : (
              <>
                <p className="home-rv-none">今日の復習はありません</p>
                <p className="dj-note home-rv-n">
                  {started ? "問題を解くと、翌日から復習に出てきます" : "戦法をえらんで学びはじめましょう"}
                </p>
              </>
            )}
          </section>
        </div>

        {started && learning && sum && (
          <div className="home-sec">
          <h2 className="fuda">学習を続ける</h2>
          <section className="dojo-panel home-learning">
            <div
              className="home-learning__body"
              role="button"
              tabIndex={0}
              aria-label={`${learning.name}・${sideName(learningSide)}のページを開く`}
              onClick={() => onOpenStrategy(learning.id, learningSide)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenStrategy(learning.id, learningSide); }
              }}
            >
              <div className="home-learning__head">
                <h3>{learning.name}・{sideName(learningSide)}</h3>
                <ChevronRight />
              </div>
              <Bar ratio={sum.total === 0 ? 0 : sum.learned / sum.total} />
              <p className="dj-line">覚えた問題 {sum.learned} / {sum.total}</p>
              <p className="dj-line">認定試験 合格 {sum.passed} / {sum.stats.length}章</p>
              <p className="dj-line">
                {next
                  ? <>次は <b>第{toKanjiNumber(next.index + 1)}章 {next.chapter.entry.label}</b></>
                  : "すべての章を覚えました"}
              </p>
            </div>
            <button
              type="button"
              className={`${hasReview ? "btn-secondary" : "btn-primary"} full`}
              onClick={() => (next ? onContinue(next.index) : onOpenStrategy(learning.id, learningSide))}
            >
              {next ? "続きから" : "章の道を見る"}
            </button>
          </section>
          </div>
        )}

        <div className="home-sec">
          <h2 className="fuda">戦法をえらぶ</h2>
          {strategies.map((s) => {
            const n = chapterCounts(s.id);
            const side = pickSide(s.id, learningId === s.id ? learningSide : "gote");
            const counts = [
              n.gote > 0 ? `後手 ${n.gote}章` : "",
              n.sente > 0 ? `先手 ${n.sente}章` : "",
            ].filter(Boolean).join(" / ");
            const open = () => onOpenStrategy(s.id, side);
            const info = (
              <>
                <PieceIcon glyph={s.category === "ibisha" ? "角" : "飛"} />
                <span className="home-card__tx">
                  <span className="home-card__name">{s.name}</span>
                  <span className="home-card__desc">{blurbOf(s).card}</span>
                  <span className="home-card__sub">{counts}</span>
                </span>
              </>
            );
            return started ? (
              <button key={s.id} type="button" className="dojo-panel home-card" onClick={open}>
                {info}<ChevronRight />
              </button>
            ) : (
              <section key={s.id} className="dojo-panel home-card home-card--first">
                <button type="button" className="home-card__row" onClick={open}>{info}</button>
                <button type="button" className="btn-primary full" onClick={open}>この戦法で学ぶ</button>
              </section>
            );
          })}
        </div>

        <button type="button" className="home-foot-link" onClick={onAbout}>
          このアプリについて・ライセンス<ChevronRight />
        </button>
      </div>
    </Screen>
  );
}
