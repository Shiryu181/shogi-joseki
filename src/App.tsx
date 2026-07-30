import { useState } from "react";
import { Sandbox } from "./features/sandbox/Sandbox";
import { Learn } from "./features/learn/Learn";
import { loadIbishaVsShikenbishaSente, loadBranchNavDemo } from "./domain/josekiLoader";

type Screen = "learn" | "sandbox" | "branchDemo";

const TABS: { key: Screen; label: string }[] = [
  { key: "learn", label: "学習(なぞり)" },
  { key: "sandbox", label: "Sandbox" },
  { key: "branchDemo", label: "分岐デモ" },
];

/**
 * Phase 0/1/2 検証用の最小切り替え。DESIGN.md §5 のホーム/タブ導線は未実装(後続フェーズ)。
 * 「分岐デモ」はユーザー向けの本番導線ではなく、分岐ナビ(本線/変化/逸れ手)の
 * 仕組みを開発・確認するためだけの画面(_branchNavDemo.json を表示する)。
 */
function App() {
  const [screen, setScreen] = useState<Screen>("learn");

  return (
    <div>
      <div
        style={{
          position: "fixed",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          gap: 6,
          background: "rgba(0,0,0,0.55)",
          padding: 4,
          borderRadius: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setScreen(t.key)}
            style={{
              padding: "4px 12px",
              borderRadius: 16,
              border: "none",
              cursor: "pointer",
              background: screen === t.key ? "#fff" : "transparent",
              color: screen === t.key ? "#241a0d" : "#fff",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {screen === "learn" && <Learn course={loadIbishaVsShikenbishaSente()} />}
      {screen === "sandbox" && <Sandbox />}
      {screen === "branchDemo" && <Learn course={loadBranchNavDemo()} />}
    </div>
  );
}

export default App;
