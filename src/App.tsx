import { useEffect, useMemo, useState } from "react";
import { Sandbox } from "./features/sandbox/Sandbox";
import { Learn } from "./features/learn/Learn";
import { Home } from "./features/home/Home";
import { SidePick } from "./features/matchup/SidePick";
import { About } from "./features/about/About";
import { Review } from "./features/review/Review";
import { Dashboard } from "./features/home/Dashboard";
import { Settings } from "./features/settings/Settings";
import { Exam } from "./features/exam/Exam";
import { applyTheme, useSettingsStore } from "./store/settingsStore";
import { useLearningStore } from "./store/learningStore";
import { STRATEGIES } from "./data/strategies";

import { loadBranchNavDemo, buildLearnPath } from "./domain/josekiLoader";
import type { LearnPath } from "./domain/josekiLoader";
import type { HomeMode } from "./features/home/Home";
import type { CardItem } from "./features/home/StrategyCard";
import "./App.css";

type Screen = "dashboard" | "home" | "side" | "learn" | "about" | "review" | "settings" | "exam" | "devMenu" | "sandbox" | "branchDemo";

/**
 * DESIGN.md §5 のユーザー導線。
 * ホーム(探す)→ 対抗形選択 → 学習/練習、+ 下部タブバー。
 * Sandbox・分岐デモは開発専用で、通常のユーザー導線からは外し、
 * `?dev=1` のときだけ画面右上の小さなリンクから到達できるようにする(完全削除はしない)。
 */
function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  // 入口は「自分の戦法」だけ。章立てがすでに相手戦型ごとなので、
  // 「相手に備える」は同じ内容を別の切り口で並べているだけだった(2026-10 に廃止)。
  const homeMode: HomeMode = "mine";
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  // 戦法と手番を選んだあとの学習パス(章の並び)と、今いる章。
  const [path, setPath] = useState<LearnPath | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);

  // ?dev=1 のときだけ開発用画面(Sandbox/分岐デモ)への入口を出す。通常のユーザーの目には触れない。
  const [devMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dev") === "1";
  });

  /**
   * 復習の対象にするコース。いまは後手ゴキゲン中飛車の章だけ。
   * ホーム画面を作り直す際に、学習中の戦法から決める形へ変える。
   */
  // いま学んでいる戦法と手番。戦法カードで手番を選ぶたびに保存される。
  const learningId = useLearningStore((s) => s.strategyId);
  const learningSide = useLearningStore((s) => s.side);
  const selectLearning = useLearningStore((s) => s.select);
  const learningName = useMemo(
    () => STRATEGIES.find((s) => s.id === learningId)?.name ?? "中飛車",
    [learningId],
  );

  /**
   * 学習中の戦法の章。並びは学習画面と同じ学習パスから取る
   * (ホームと学習で順番が食い違わないように)。
   */
  const learningPath = useMemo(
    () => buildLearnPath("mine", learningId, learningName, learningSide),
    [learningId, learningName, learningSide],
  );
  const reviewCourses = useMemo(
    () => learningPath.chapters.map((c) => ({ course: c.course, label: c.entry.label })),
    [learningPath],
  );

  /** ホームの「続きから」。指定の章から始める。 */
  function continueLearning(index: number) {
    setPath(learningPath);
    setChapterIndex(index);
    setScreen("learn");
  }

  function openCard(_mode: HomeMode, item: CardItem) {
    setSelectedCard(item);
    setScreen("side");
  }

  function startPath(side: "sente" | "gote") {
    if (!selectedCard) return;
    // 選んだ戦法と手番を「学習中」として覚える。次にホームを開いたときはこれが出る。
    selectLearning(selectedCard.id, side);
    setPath(buildLearnPath(homeMode, selectedCard.id, selectedCard.name, side));
    setChapterIndex(0);
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
        {screen === "dashboard" && (
          <Dashboard
            chapters={learningPath.chapters}
            strategyName={learningName}
            sideLabel={learningSide === "sente" ? "先手" : "後手"}
            onContinue={continueLearning}
            onReview={() => setScreen("review")}
            onPickStrategy={() => setScreen("home")}
            onExam={() => setScreen("exam")}
            onSettings={() => setScreen("settings")}
            onAbout={() => setScreen("about")}
          />
        )}
        {screen === "home" && (
          <Home mode={homeMode} onOpenCard={openCard} onOpenAbout={() => setScreen("about")} />
        )}
        {screen === "review" && <Review courses={reviewCourses} onBack={() => setScreen("dashboard")} />}
        {screen === "settings" && <Settings onBack={() => setScreen("dashboard")} />}
        {screen === "exam" && (
          <Exam chapters={learningPath.chapters} onBack={() => setScreen("dashboard")} />
        )}

        {screen === "side" && selectedCard && (
          <SidePick mode={homeMode} item={selectedCard} onBack={() => setScreen("home")} onPick={startPath} />
        )}

        {screen === "learn" && path && (
          <Learn
            course={path.chapters[chapterIndex].course}
            path={path}
            chapterIndex={chapterIndex}
            onNextChapter={
              chapterIndex + 1 < path.chapters.length ? () => setChapterIndex(chapterIndex + 1) : undefined
            }
            onBack={() => setScreen("dashboard")}
          />
        )}

        {screen === "about" && <About onBack={() => setScreen("dashboard")} />}

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
                分岐デモ(本線/変化/逸れ手 切替の確認用)
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
