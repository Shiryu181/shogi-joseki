import { useEffect, useState } from "react";
import { Sandbox } from "./features/sandbox/Sandbox";
import { Learn } from "./features/learn/Learn";
import { Practice } from "./features/practice/Practice";
import { Home } from "./features/home/Home";
import { Matchup } from "./features/matchup/Matchup";
import { About } from "./features/about/About";
import type { PracticeMode } from "./features/matchup/Matchup";
import { loadCourseById, loadBranchNavDemo, COURSE_ENTRIES, courseEntriesFor } from "./domain/josekiLoader";
import type { Strategy } from "./domain/types";
import { STRATEGIES } from "./data/strategies";
import { BottomTabBar } from "./ui/BottomTabBar";
import type { BottomTab } from "./ui/BottomTabBar";
import "./App.css";

type Screen = "home" | "matchup" | "learn" | "practice" | "about" | "devMenu" | "sandbox" | "branchDemo";

const IBISHA_STRATEGY = STRATEGIES.find((s) => s.id === "ibisha")!;

/**
 * DESIGN.md §5 のユーザー導線。
 * ホーム(探す)→ 対抗形選択 → 学習/練習、+ 下部タブバー。
 * Sandbox・分岐デモは開発専用で、通常のユーザー導線からは外し、
 * `?dev=1` のときだけ画面右上の小さなリンクから到達できるようにする(完全削除はしない)。
 */
function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy>(IBISHA_STRATEGY);
  // 対抗形選択画面で選んだ作戦(定石コース)。学習/練習の両方に渡す。
  const [courseId, setCourseId] = useState<string>(COURSE_ENTRIES[0].id);

  // ?dev=1 のときだけ開発用画面(Sandbox/分岐デモ)への入口を出す。通常のユーザーの目には触れない。
  const [devMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dev") === "1";
  });

  function openStrategy(strategy: Strategy) {
    setSelectedStrategy(strategy);
    // 別の戦法へ移ったとき、前の戦法のコースが選ばれたままにならないようにする。
    const first = courseEntriesFor(strategy.id)[0];
    if (first) setCourseId(first.id);
    setScreen("matchup");
  }

  function startFromMatchup(nextCourseId: string, mode: PracticeMode) {
    setCourseId(nextCourseId);
    setScreen(mode === "learn" ? "learn" : "practice");
  }

  function openIbishaLearnDirect() {
    setSelectedStrategy(IBISHA_STRATEGY);
    setScreen("learn");
  }

  // 画面遷移のたびにスクロール位置をリセットする(前の画面でスクロールした状態のまま
  // 次の画面に来ると、タイトルの途中から表示される等おかしくなるため)。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const showTabBar = screen === "home" || screen === "matchup" || screen === "learn" || screen === "practice";
  const activeTab: BottomTab | null =
    screen === "home" || screen === "matchup" ? "home" : screen === "learn" || screen === "practice" ? "learn" : null;

  return (
    <div className="app-shell">
      {devMode && screen !== "devMenu" && screen !== "sandbox" && screen !== "branchDemo" && (
        <button type="button" className="dev-fab" onClick={() => setScreen("devMenu")}>
          開発 ▸
        </button>
      )}

      <div className="app-content" style={showTabBar ? { paddingBottom: 78 } : undefined}>
        {screen === "home" && <Home onOpenStrategy={openStrategy} onOpenAbout={() => setScreen("about")} />}

        {screen === "matchup" && (
          <Matchup strategy={selectedStrategy} onBack={() => setScreen("home")} onStart={startFromMatchup} />
        )}

        {screen === "learn" && (
          <Learn course={loadCourseById(courseId)} onBack={() => setScreen("matchup")} />
        )}

        {screen === "practice" && (
          <Practice course={loadCourseById(courseId)} onBack={() => setScreen("matchup")} />
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
                  <div className="tl">JOSEKI DOJO ・ 開発用</div>
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

      {showTabBar && <BottomTabBar active={activeTab} onSelectHome={() => setScreen("home")} onSelectLearn={openIbishaLearnDirect} />}
    </div>
  );
}

export default App;
