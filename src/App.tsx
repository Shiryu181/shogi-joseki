import { useEffect, useMemo, useState } from "react";
import { Sandbox } from "./features/sandbox/Sandbox";
import { Learn } from "./features/learn/Learn";
import { Home } from "./features/home/Home";
import { StrategyPage } from "./features/strategy/StrategyPage";
import { ChapterPage } from "./features/chapter/ChapterPage";
import { About } from "./features/about/About";
import { Review } from "./features/review/Review";
import { Settings } from "./features/settings/Settings";
import { Exam } from "./features/exam/Exam";
import { applyTheme, useSettingsStore } from "./store/settingsStore";
import { useLearningStore } from "./store/learningStore";
import { STRATEGIES } from "./data/strategies";
import { loadBranchNavDemo } from "./domain/josekiLoader";
import { READY_STRATEGY_IDS, chapterCounts, pathFor, sideName } from "./domain/courseProgress";
import type { Side } from "./domain/courseProgress";
import "./App.css";

type Screen =
  | "home" | "strategy" | "chapter" | "learn" | "exam" | "review" | "settings" | "about"
  | "devMenu" | "sandbox" | "branchDemo";

/**
 * ユーザー導線: ホーム → 戦法のページ → 章のページ → 学習。
 * 戦法のページから認定試験の一覧へ、ホームから復習・設定・このアプリについてへ。
 * 戦法と手番は「学習中」(learningStore)に1組だけ持ち、戦法のページの切替シートで変える。
 * Sandbox・分岐デモは開発専用で、`?dev=1` のときだけ画面右上の小さなリンクから到達できる。
 */
function App() {
  const [screen, setScreen] = useState<Screen>("home");
  // 章のページ・学習・認定試験が指す章(学習中の戦法×手番の章の並びの何番目か)。
  const [chapterIndex, setChapterIndex] = useState(0);
  // 学習画面を閉じたときに戻る先(ホームの「続きから」で入ったか、章のページから入ったか)。
  const [learnFrom, setLearnFrom] = useState<"home" | "chapter">("home");
  // 学習を章の1手目から始めるか(章のページの「最初から学ぶ」)。
  const [learnRestart, setLearnRestart] = useState(false);
  // 章のページから認定試験をすぐ始めるときの章。一覧から入ったときは undefined。
  const [examAuto, setExamAuto] = useState<number | undefined>(undefined);

  // ?dev=1 のときだけ開発用画面(Sandbox/分岐デモ)への入口を出す。通常のユーザーの目には触れない。
  const [devMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dev") === "1";
  });

  // いま学んでいる戦法と手番。
  const learningId = useLearningStore((s) => s.strategyId);
  const learningSide = useLearningStore((s) => s.side);
  const selectLearning = useLearningStore((s) => s.select);
  const learningName = useMemo(
    () => STRATEGIES.find((s) => s.id === learningId)?.name ?? learningId,
    [learningId],
  );

  /** 学習中の戦法×手番の章。並びは学習画面と同じ学習パスから取る。 */
  const learningPath = useMemo(() => pathFor(learningId, learningSide), [learningId, learningSide]);

  /** 今日の復習の対象: 仕上がっている全戦法の先手・後手すべての章。 */
  const allChapters = useMemo(
    () =>
      READY_STRATEGY_IDS.flatMap((id) => {
        const n = chapterCounts(id);
        return (["gote", "sente"] as const)
          .filter((side) => n[side] > 0)
          .flatMap((side) => pathFor(id, side).chapters);
      }),
    [],
  );
  const reviewCourses = useMemo(
    () => allChapters.map((c) => ({ course: c.course, label: c.entry.label })),
    [allChapters],
  );

  function openStrategy(strategyId: string, side: Side) {
    // 選んだ戦法と手番を「学習中」として覚える。
    selectLearning(strategyId, side);
    setScreen("strategy");
  }

  function openChapter(index: number) {
    setChapterIndex(index);
    setScreen("chapter");
  }

  /** index の章の学習を始める。from は閉じたときの戻り先。 */
  function startLearn(index: number, from: "home" | "chapter", restart: boolean) {
    setChapterIndex(index);
    setLearnFrom(from);
    setLearnRestart(restart);
    setScreen("learn");
  }

  // 保存されたテーマを最初に一度だけ反映する。
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => { applyTheme(theme); }, [theme]);

  // 画面遷移のたびにスクロール位置をリセットする(前の画面でスクロールした状態のまま
  // 次の画面に来ると、タイトルの途中から表示される等おかしくなるため)。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  // 学習画面ではタブバーを出さない(戻るボタンで足りる)。スマホの縦の場所を盤と解説に使うため。

  return (
    <div className="app-shell">
      {devMode && screen !== "devMenu" && screen !== "sandbox" && screen !== "branchDemo" && (
        <button type="button" className="dev-fab" onClick={() => setScreen("devMenu")}>
          開発 ▸
        </button>
      )}

      <div className="app-content">
        {screen === "home" && (
          <Home
            allChapters={allChapters}
            onReview={() => setScreen("review")}
            onSettings={() => setScreen("settings")}
            onAbout={() => setScreen("about")}
            onOpenStrategy={openStrategy}
            onContinue={(index) => startLearn(index, "home", false)}
          />
        )}
        {screen === "strategy" && (
          <StrategyPage
            strategyId={learningId}
            side={learningSide}
            onBack={() => setScreen("home")}
            onSelectSide={(side) => selectLearning(learningId, side)}
            onOpenChapter={openChapter}
            onOpenExam={() => { setExamAuto(undefined); setScreen("exam"); }}
          />
        )}
        {screen === "chapter" && (
          <ChapterPage
            strategyId={learningId}
            side={learningSide}
            chapterIndex={chapterIndex}
            onBack={() => setScreen("strategy")}
            onLearn={(restart) => startLearn(chapterIndex, "chapter", restart)}
            onExam={() => { setExamAuto(chapterIndex); setScreen("exam"); }}
          />
        )}
        {screen === "review" && <Review courses={reviewCourses} onBack={() => setScreen("home")} />}
        {screen === "settings" && <Settings onBack={() => setScreen("home")} />}
        {screen === "exam" && (
          <Exam
            chapters={learningPath.chapters}
            heading={`${learningName}・${sideName(learningSide)}`}
            autoStart={examAuto}
            onBack={() => setScreen(examAuto === undefined ? "strategy" : "chapter")}
          />
        )}

        {screen === "learn" && learningPath.chapters[chapterIndex] && (
          <Learn
            course={learningPath.chapters[chapterIndex].course}
            path={learningPath}
            chapterIndex={chapterIndex}
            restart={learnRestart}
            onNextChapter={
              chapterIndex + 1 < learningPath.chapters.length ? () => setChapterIndex(chapterIndex + 1) : undefined
            }
            onBack={() => setScreen(learnFrom === "chapter" ? "chapter" : "home")}
            onStrategy={() => setScreen("strategy")}
            onExam={() => { setExamAuto(chapterIndex); setScreen("exam"); }}
          />
        )}

        {screen === "about" && <About onBack={() => setScreen("home")} />}

        {screen === "devMenu" && (
          <div className="devmenu-wrap">
            <div className="devmenu-frame">
              <div className="abar">
                <button type="button" className="back" onClick={() => setScreen("home")} aria-label="戻る">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                </button>
                <div>
                  <div className="tl">定跡道場 ・ 開発用</div>
                  <h1>開発メニュー</h1>
                </div>
              </div>
              <p className="devmenu-note">
                ここから先は動作確認用の画面です。通常のユーザー導線には出てきません(<code>?dev=1</code> でのみ到達可能)。
              </p>
              <button type="button" className="devmenu-item" onClick={() => setScreen("sandbox")}>
                Sandbox(自由対局・検証用)
              </button>
              <button type="button" className="devmenu-item" onClick={() => setScreen("branchDemo")}>
                学習画面デモ(デモのコースで学習画面を動かす)
              </button>
            </div>
          </div>
        )}

        {screen === "sandbox" && <Sandbox onBack={() => setScreen("devMenu")} />}

        {screen === "branchDemo" && <Learn course={loadBranchNavDemo()} onBack={() => setScreen("devMenu")} />}
      </div>
    </div>
  );
}

export default App;
